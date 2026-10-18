// OpenCITE — Search-capture telemetry (sprint v0.50)
// Route: /api/telemetry → /api/user/telemetry (rewrite; mounted via api/user/[resource].js —
//        no new Serverless Function, Hobby caps a deploy at 12)
// Runtime: Node.js (Prisma, via searchLog.js)
//
// Web searches never touch /api/search (the browser fans out to the adapters itself), so this is
// how they reach the search log. Three POST kinds from the SPA (lib/telemetry.js), session optional:
//   POST { kind:"search", query, executedQuery, settings, eligible, failed, records[], page }
//        → logs a search_events row (+ works upserts) → { eventId }
//   POST { kind:"signal", eventId, record, rank, action, meta }   → one search_signals row
//   POST { kind:"dwell",  eventId, ms }                           → search_events.dwell_ms
// Guards: same-origin (requireInternalOrigin — Sec-Fetch-Site; a soft guard, not auth), a per-actor
// window (120/min via KV, fail-open), body cap raised to 256 KB for the 100-deep page.
//
// Admin-only GET views for the console tab (components/admin/SearchData.jsx), gated by the SAME
// server-derived allowlist as /api/search?debug=1 (apiAuth.resolveSessionAdmin):
//   ?view=summary | zero | sources | semantic | export[&since=ISO&after=id]
// POST ?view=promote (admin) → folds click signals into relevance_labels (sprint §4.1).

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { setCorsHeaders, getSession } from "../auth.js";
import { parseBody } from "../parseBody.js";
import { requireInternalOrigin } from "../requireInternalOrigin.js";
import { resolveSessionAdmin } from "../apiAuth.js";
import { checkRateLimit } from "../ratelimit.js";
import { logSearch, logSignal, setDwell, requestContext, SURFACE, SIGNAL } from "../searchLog.js";

const BEACON_MAX_BYTES = 262_144; // 256 KB — a 100-deep OpenAlex page with abstracts is ~150 KB
const BEACON_PLAN = { id: "telemetry", rateLimit: { windowSeconds: 60, max: 120 } };
const MAX_RECORDS = 400;
const MAX_QUERY = 2000;
const WEB_ACTIONS = new Set([SIGNAL.click_title, SIGNAL.open_link, SIGNAL.copy_cite, SIGNAL.save_library, SIGNAL.expand_cite, SIGNAL.dwell]);
const EXPORT_PAGE = 2000;

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? Number(v) : v)));
};
const firstParam = (v) => (Array.isArray(v) ? v[0] : v) ?? "";
const str = (v, n) => (v == null ? null : String(v).slice(0, n));

// Whitelist the UI settings we keep — never the per-user upstream keys (coreKey/ndliKey/…).
const SETTINGS_KEYS = ["viewMode", "authorSearch", "semanticSearch", "telemetry"];
function snapshotSettings(s) {
  if (!s || typeof s !== "object") return null;
  const out = {};
  for (const k of SETTINGS_KEYS) if (k in s) out[k] = s[k];
  if (s.enabledSources && typeof s.enabledSources === "object") {
    out.enabledSources = Object.keys(s.enabledSources).filter((k) => s.enabledSources[k]).slice(0, 60);
  }
  if (s.sortBy) out.sortBy = String(s.sortBy).slice(0, 20);
  return out;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res, "GET, POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const view = firstParam(req.query?.view).trim().toLowerCase();

  // ── Admin views ──────────────────────────────────────────────────────────────────────────────
  if (view) {
    const admin = await resolveSessionAdmin(req);
    if (!admin) return json(res, 401, { error: "Admin session required." });
    try {
      if (req.method === "POST" && view === "promote") return json(res, 200, await promoteLabels());
      if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
      if (view === "summary")  return json(res, 200, await summary());
      if (view === "zero")     return json(res, 200, await zeroResult());
      if (view === "sources")  return json(res, 200, await sourceShare());
      if (view === "semantic") return json(res, 200, await semanticSplit());
      if (view === "export")   return exportNdjson(req, res);
      return json(res, 400, { error: `Unknown view "${view}".`, allowed: ["summary", "zero", "sources", "semantic", "export", "promote"] });
    } catch (err) {
      return json(res, 500, { error: "View failed.", detail: String(err?.code || err?.name || "error") });
    }
  }

  // ── Browser beacon ───────────────────────────────────────────────────────────────────────────
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
  if (!requireInternalOrigin(req, res)) return; // 403 written

  const ctx = requestContext(req);
  const rl = await checkRateLimit(`tele:${ctx.actor.toString("hex")}`, BEACON_PLAN);
  if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); return json(res, 429, { error: "Too many events." }); }

  const body = await parseBody(req, res, { maxBytes: BEACON_MAX_BYTES });
  if (body === null) return; // 413 written
  const user = await getSession(req); // optional — anonymous web searches are logged too
  const kind = String(body.kind || "");

  if (kind === "search") {
    const query = str(body.query, MAX_QUERY)?.trim();
    if (!query) return json(res, 400, { error: "Missing query." });
    const records = Array.isArray(body.records) ? body.records.slice(0, MAX_RECORDS).filter((r) => r && typeof r === "object") : [];
    const eventId = await logSearch({
      identity: user ? { userId: user.id, keyId: null, plan: null, admin: false } : null,
      ctx,
      surface: SURFACE.web,
      query,
      terms: query.split(";").map((s) => s.trim()).filter(Boolean),
      settings: { ...snapshotSettings(body.settings), ...(body.executedQuery && body.executedQuery !== query ? { executedQuery: str(body.executedQuery, 500) } : {}) },
      eligible: (Array.isArray(body.eligible) ? body.eligible : []).slice(0, 60).map(String),
      failed: (Array.isArray(body.failed) ? body.failed : []).slice(0, 60).map(String),
      coverage: null,
      records,
      nRaw: Number.isFinite(body.nRaw) ? body.nRaw : records.length,
      nDedup: records.length,
      tookMs: Number.isFinite(body.tookMs) ? body.tookMs : null,
      page: Number.isInteger(body.page) ? Math.max(0, Math.min(body.page, 32767)) : 0,
      experiment: str(body.experiment, 60),
    });
    return json(res, 200, { eventId });
  }

  if (kind === "signal") {
    const action = Number(body.action);
    if (!WEB_ACTIONS.has(action)) return json(res, 400, { error: "Unknown action." });
    const ok = await logSignal({
      eventId: body.eventId,
      record: body.record,
      rank: Number.isInteger(body.rank) ? body.rank : -1,
      action,
      meta: body.meta && typeof body.meta === "object" ? JSON.parse(JSON.stringify(body.meta).slice(0, 2000)) : null,
    });
    return json(res, ok ? 200 : 202, { ok });
  }

  if (kind === "dwell") {
    const ok = await setDwell({ eventId: body.eventId, ms: body.ms });
    return json(res, ok ? 200 : 202, { ok });
  }

  return json(res, 400, { error: "Unknown kind.", allowed: ["search", "signal", "dwell"] });
}

// ── Admin views (read-only SQL) ────────────────────────────────────────────────────────────────

async function summary() {
  const [bySurface, totals, signals] = await Promise.all([
    prisma.$queryRaw`
      SELECT "surface", count(*)::int AS n, count(DISTINCT "actor")::int AS actors, count(DISTINCT "user_id")::int AS users,
             avg("latency_ms")::int AS avg_ms, avg("dwell_ms")::int AS avg_dwell_ms,
             count(*) FILTER (WHERE "n_returned" = 0)::int AS zero, count(*) FILTER (WHERE "cache_hit")::int AS cache_hits
      FROM "search_events" WHERE "ts" > now() - interval '30 days' GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw`
      SELECT (SELECT count(*)::int FROM "search_events") AS events,
             (SELECT count(*)::int FROM "works") AS works,
             (SELECT count(*)::int FROM "works" WHERE "abstract" IS NOT NULL) AS works_with_abstract,
             (SELECT count(*)::int FROM "search_signals") AS signals,
             (SELECT count(*)::int FROM "relevance_labels") AS labels,
             (SELECT pg_size_pretty(pg_total_relation_size('search_events') + pg_total_relation_size('works') + pg_total_relation_size('search_signals'))) AS size`,
    prisma.$queryRaw`
      SELECT "action", count(*)::int AS n, count(*) FILTER (WHERE "event_id" IS NULL)::int AS unmatched
      FROM "search_signals" WHERE "ts" > now() - interval '30 days' GROUP BY 1 ORDER BY 1`,
  ]);
  return { window: "30d", bySurface, totals: totals[0], signals };
}

// Queries that came back empty or nearly so — the "what are we missing" list.
async function zeroResult() {
  const rows = await prisma.$queryRaw`
    SELECT "query", count(*)::int AS n, max("ts") AS last, max("n_returned")::int AS best, array_agg(DISTINCT "surface") AS surfaces
    FROM "search_events" WHERE "ts" > now() - interval '30 days' AND COALESCE("n_returned", 0) <= 2
    GROUP BY 1 ORDER BY n DESC, last DESC LIMIT 200`;
  return { window: "30d", rows };
}

// Per-source impression share vs click share (clicked = any web action 0–3 or machine 10–13).
async function sourceShare() {
  const [impressions, clicks] = await Promise.all([
    prisma.$queryRaw`
      SELECT u.ord AS ordinal, count(*)::int AS n, count(*) FILTER (WHERE u.pos <= 5)::int AS top5
      FROM "search_events" e, unnest(e."top_src") WITH ORDINALITY AS u(ord, pos)
      WHERE e."ts" > now() - interval '30 days' GROUP BY 1 ORDER BY n DESC`,
    prisma.$queryRaw`
      SELECT e."top_src"[s."rank" + 1] AS ordinal, count(*)::int AS n, avg(s."rank")::numeric(6,2) AS avg_rank
      FROM "search_signals" s JOIN "search_events" e ON e."id" = s."event_id"
      WHERE s."rank" >= 0 AND s."ts" > now() - interval '30 days' AND s."action" IN (0,1,2,3,10,11,12,13)
      GROUP BY 1 ORDER BY n DESC`,
  ]);
  return { window: "30d", impressions, clicks };
}

// Semantic toggle on vs off (web only): searches, searches with a click in the top 5, dwell.
async function semanticSplit() {
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(("settings"->>'semanticSearch')::boolean, false) AS semantic,
           count(*)::int AS searches,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "search_signals" s WHERE s."event_id" = e."id" AND s."rank" BETWEEN 0 AND 4 AND s."action" IN (0,1,2,3)))::int AS with_click_top5,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "search_signals" s WHERE s."event_id" = e."id" AND s."action" IN (0,1,2,3)))::int AS with_click,
           avg("dwell_ms")::int AS avg_dwell_ms, avg("n_returned")::numeric(6,1) AS avg_returned
    FROM "search_events" e WHERE "surface" = 0 AND "ts" > now() - interval '90 days' GROUP BY 1 ORDER BY 1`;
  return { window: "90d", rows };
}

// Streams NDJSON: one line per event, results expanded with their works row + source + score,
// signals attached. Cursor-paginated internally (`after` = last event id) so the whole table can
// be pulled in one request: this is the "data I can play with" door.
async function exportNdjson(req, res) {
  const since = firstParam(req.query?.since).trim();
  const sinceDate = since && !Number.isNaN(Date.parse(since)) ? new Date(since) : new Date(0);
  let after = Number(firstParam(req.query?.after)) || 0;
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="opencite-search-events-${new Date().toISOString().slice(0, 10)}.ndjson"`);
  for (;;) {
    const events = await prisma.$queryRaw`
      SELECT * FROM "search_events" WHERE "id" > ${BigInt(after)} AND "ts" >= ${sinceDate}
      ORDER BY "id" ASC LIMIT ${EXPORT_PAGE}`;
    if (!events.length) break;
    const workIds = [...new Set(events.flatMap((e) => e.top))];
    const works = workIds.length
      ? await prisma.$queryRaw`SELECT * FROM "works" WHERE "id" IN (${Prisma.join(workIds)})`
      : [];
    const byId = new Map(works.map((w) => [Number(w.id), w]));
    const eventIds = events.map((e) => BigInt(e.id));
    const signals = await prisma.$queryRaw`SELECT * FROM "search_signals" WHERE "event_id" IN (${Prisma.join(eventIds)})`;
    const sigByEvent = new Map();
    for (const s of signals) {
      const k = Number(s.event_id);
      if (!sigByEvent.has(k)) sigByEvent.set(k, []);
      sigByEvent.get(k).push({ work_id: s.work_id, rank: s.rank, action: s.action, ts: s.ts, meta: s.meta });
    }
    for (const e of events) {
      const { actor, ip_hash, top, top_src, scores, ...rest } = e;
      const line = {
        ...rest,
        id: Number(e.id),
        actor: actor ? Buffer.from(actor).toString("hex") : null,
        results: top.map((wid, i) => ({ rank: i, src: top_src[i], score: scores[i] ?? null, work: byId.get(Number(wid)) || { id: wid } })),
        signals: sigByEvent.get(Number(e.id)) || [],
      };
      res.write(JSON.stringify(line, (_, v) => (typeof v === "bigint" ? Number(v) : v)) + "\n");
      after = Number(e.id);
    }
    if (events.length < EXPORT_PAGE) break;
  }
  res.end();
}

// Sprint v0.50 §4.1 — implicit labels. Clicked (web 0–3 / machine 10–13) → grade 2 for (query, doi)
// unless a label exists; works ranked ABOVE the lowest clicked rank with no signal → grade 0 unless
// a label exists (Joachims skip-above). Never lowers an existing label. Idempotent.
async function promoteLabels() {
  const clicked = await prisma.$executeRaw`
    INSERT INTO "relevance_labels" ("query","doi","grade","created_at","updated_at")
    SELECT DISTINCT e."query", w."doi", 2, now(), now()
    FROM "search_signals" s
    JOIN "search_events" e ON e."id" = s."event_id"
    JOIN "works" w ON w."id" = s."work_id"
    WHERE s."action" IN (0,1,2,3,10,11,12,13) AND w."doi" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "relevance_labels" r WHERE r."query" = e."query" AND r."doi" = w."doi")`;
  const skipped = await prisma.$executeRaw`
    INSERT INTO "relevance_labels" ("query","doi","grade","created_at","updated_at")
    SELECT DISTINCT e."query", w."doi", 0, now(), now()
    FROM "search_events" e
    JOIN LATERAL (SELECT max(s."rank") AS mr FROM "search_signals" s WHERE s."event_id" = e."id" AND s."action" IN (0,1,2,3,10,11,12,13) AND s."rank" >= 0) c ON c.mr IS NOT NULL
    JOIN LATERAL unnest(e."top") WITH ORDINALITY AS u(wid, pos) ON (u.pos - 1) < c.mr
    JOIN "works" w ON w."id" = u.wid
    WHERE w."doi" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "search_signals" s2 WHERE s2."event_id" = e."id" AND s2."work_id" = u.wid)
      AND NOT EXISTS (SELECT 1 FROM "relevance_labels" r WHERE r."query" = e."query" AND r."doi" = w."doi")`;
  return { promoted: { clicked_grade2: clicked, skipped_grade0: skipped } };
}
