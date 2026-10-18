// OpenCITE — search data capture SSOT (sprint v0.50)
//
// The ONE writer for the three capture tables (prisma: works · search_events · search_signals).
// Every search surface funnels through here:
//   • /api/search (API + MCP, live AND cache-hit paths)          → logSearch
//   • the browser beacon, handlers/telemetry.js (web searches)   → logSearch / logSignal / setDwell
//   • /api/works/{get,verify,citations,ids} (an agent's "click") → logMachineSignal
//
// Storage rule: REFERENCES, never cards. A result page is `top INTEGER[]` of works.id in displayed
// order, with parallel `top_src` (adapter ordinal, adapters/_shared/ordinals.js) and `scores`
// (×1000). `works` is upserted once per distinct paper (key = publicResult.anonymizeId, the same
// opaque id the public card carries) and only ever gets RICHER (longer abstract wins, nulls fill).
//
// Contract: FAIL-OPEN, like kv.js. Nothing here throws to a caller; a DB hiccup logs a warning and
// the search / signal is simply not recorded. Callers bound the wait with `withBudget` so logging
// can never add more than LOG_BUDGET_MS to a response.
//
// Raw SQL via prisma.$queryRaw (tagged template → parameterised): Prisma's typed client cannot
// express the multi-row `INSERT … ON CONFLICT DO UPDATE … RETURNING` or the `top @> ARRAY[...]`
// GIN join, and the arrays are the whole point of the compact layout.

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { anonymizeId } from "./publicResult.js";
import { log } from "./log.js";
import { ordinalOf, ADAPTER_ORDINAL } from "../../src/adapters/_shared/ordinals.js";

// ── Codes (SSOT — the browser mirrors SIGNAL in src/lib/telemetry.js) ──────────────────────────

export const SURFACE = Object.freeze({ web: 0, api: 1, mcp: 2, admin: 3 });

export const SIGNAL = Object.freeze({
  // web (ResultCard)
  click_title: 0,     // title link opened (DOI or URL)
  open_link: 1,       // "Read full text →" / preview image link opened
  copy_cite: 2,       // a citation copied            meta: { style }
  save_library: 3,    // saved to library (add only)
  expand_cite: 4,     // citation drawer expanded
  dwell: 5,           // came back after opening a result  meta: { ms }
  // machine (follow-on API calls — an agent's "click")
  get_work: 10,       // /api/works/get on a result
  verify_ref: 11,     // /api/works/verify on a reference  meta: { verdict }
  citations_graph: 12,// /api/works/citations on a result
  resolve_ids: 13,    // /api/works/ids on a result
});

const MACHINE_JOIN_WINDOW = "10 minutes"; // a follow-on call joins to this caller's latest search within the window
export const LOG_BUDGET_MS = 600;         // max wait a response path spends on logging
const MAX_ABSTRACT = 4000;
const MAX_TEXT = 1000;
const MAX_LIST = 25;
const UPSERT_CHUNK = 100;

// ── Request context: who/what, hashed ──────────────────────────────────────────────────────────

const PEPPER = process.env.API_KEY_PEPPER || process.env.AUTH_SECRET || "";
const sha256 = (s) => createHash("sha256").update(String(s)).digest();
const first = (v) => (Array.isArray(v) ? v[0] : v) ?? "";

export const clientIp = (req) => (first(req?.headers?.["x-forwarded-for"]) || "").split(",")[0].trim() || "anon";

// actor = sha256(ip | ua | daily salt)[:8] — groups one anonymous browser/agent for a day, rotates
// daily so it is not a durable identifier. ip_hash = sha256(ip | pepper)[:8] — abuse forensics only.
export function requestContext(req) {
  const h = req?.headers || {};
  const ip = clientIp(req);
  const ua = String(first(h["user-agent"]) || "").slice(0, 300) || null;
  const explicitClient = String(first(h["x-opencite-client"]) || "").slice(0, 80);
  const client = explicitClient || (h["sec-fetch-site"] ? "browser" : null);
  const tool = String(first(h["x-opencite-tool"]) || "").slice(0, 80) || null;
  const day = new Date().toISOString().slice(0, 10);
  const daySalt = sha256(`${PEPPER}|${day}`).toString("hex");
  return {
    ip, ua, client, tool,
    actor: sha256(`${ip}|${ua || ""}|${daySalt}`).subarray(0, 8),
    ipHash: sha256(`${ip}|${PEPPER}`).subarray(0, 8),
  };
}

// Surface for a server-side search: admin debug → admin; MCP package → mcp; else api.
export function surfaceFor(identity, ctx, { debug = false } = {}) {
  if (identity?.admin && debug) return SURFACE.admin;
  if ((ctx?.client || "").startsWith("opencite-mcp")) return SURFACE.mcp;
  return SURFACE.api;
}

// Bound a logging promise: resolves to the result, or null after `ms`. Never rejects.
export function withBudget(promise, ms = LOG_BUDGET_MS) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    Promise.resolve(promise).then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
  });
}

// ── Row shaping ────────────────────────────────────────────────────────────────────────────────

const clip = (s, n) => (s == null ? null : String(s).slice(0, n) || null);
const strList = (arr, n = MAX_LIST) =>
  (Array.isArray(arr) ? arr : []).map((x) => (typeof x === "string" ? x : x?.name ?? "")).map((s) => s.trim())
    .filter((s) => s && s !== "et al.").slice(0, n).map((s) => s.slice(0, 300));
const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const normDoi = (d) => {
  if (!d) return null;
  const s = String(d).trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:/i, "").toLowerCase();
  return /^10\.\d{4,9}\//.test(s) ? s.slice(0, 300) : null;
};

// Accepts a normalized adapter record (browser / live fan-out) OR a public card (cache-hit path:
// compact `venue`, `oc_` id). The oc_id is recomputed from the same basis anonymizeId uses, so a
// card and its source record always land on the same works row.
export function workRowFrom(r) {
  const oc_id = typeof r.id === "string" && r.id.startsWith("oc_") ? r.id : anonymizeId(r);
  return {
    oc_id,
    doi: normDoi(r.doi),
    source: String(r.source || "UNSEEN").toUpperCase().slice(0, 40),
    title: clip(r.title, MAX_TEXT),
    authors: strList(r.authors),
    year: toInt(r.year),
    venue: clip(r.journal || r.venue || r.publisher, 500),
    type: clip(r.type, 60),
    abstract: clip(r.abstract, MAX_ABSTRACT),
    keywords: strList(r.keywords, 15),
    url: clip(r.url, MAX_TEXT),
    is_oa: r.isOA == null ? null : !!r.isOA,
    cited_by: toInt(r.citedBy),
  };
}

// Postgres array literals as typed SQL fragments (an empty JS array must not bind as unknown[]).
const textArr = (arr) => (arr.length ? Prisma.sql`ARRAY[${Prisma.join(arr)}]::text[]` : Prisma.sql`'{}'::text[]`);
const intArr = (arr) => (arr.length ? Prisma.sql`ARRAY[${Prisma.join(arr)}]::int4[]` : Prisma.sql`'{}'::int4[]`);
const jsonb = (obj) => (obj == null ? Prisma.sql`NULL` : Prisma.sql`${JSON.stringify(obj)}::jsonb`);

// ── works ──────────────────────────────────────────────────────────────────────────────────────

// Multi-row upsert. Returns Map<oc_id, works.id>. Merge policy mirrors dedup.mergeRecords: a row
// only gets richer — longer abstract wins, nulls fill, cited_by takes the max, is_oa ORs, lists
// fill when empty. `seen_n` counts pages the work appeared on.
export async function upsertWorks(rows) {
  const byId = new Map();
  for (const r of rows) if (r?.oc_id && !byId.has(r.oc_id)) byId.set(r.oc_id, r);
  const uniq = [...byId.values()];
  const out = new Map();
  for (let i = 0; i < uniq.length; i += UPSERT_CHUNK) {
    const chunk = uniq.slice(i, i + UPSERT_CHUNK);
    const values = chunk.map((w) => Prisma.sql`(
      ${w.oc_id}, ${w.doi}, ${w.source}, ${w.title}, ${textArr(w.authors)}, ${w.year}::smallint, ${w.venue}, ${w.type},
      ${w.abstract}, ${textArr(w.keywords)}, ${w.url}, ${w.is_oa}::boolean, ${w.cited_by}::int4
    )`);
    const res = await prisma.$queryRaw`
      INSERT INTO "works" ("oc_id","doi","source","title","authors","year","venue","type","abstract","keywords","url","is_oa","cited_by")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("oc_id") DO UPDATE SET
        "seen_n"   = "works"."seen_n" + 1,
        "doi"      = COALESCE("works"."doi", EXCLUDED."doi"),
        "title"    = COALESCE("works"."title", EXCLUDED."title"),
        "venue"    = COALESCE("works"."venue", EXCLUDED."venue"),
        "type"     = COALESCE("works"."type", EXCLUDED."type"),
        "url"      = COALESCE("works"."url", EXCLUDED."url"),
        "year"     = COALESCE("works"."year", EXCLUDED."year"),
        "abstract" = CASE WHEN length(COALESCE(EXCLUDED."abstract",'')) > length(COALESCE("works"."abstract",''))
                          THEN EXCLUDED."abstract" ELSE "works"."abstract" END,
        "authors"  = CASE WHEN cardinality("works"."authors") = 0 THEN EXCLUDED."authors" ELSE "works"."authors" END,
        "keywords" = CASE WHEN cardinality("works"."keywords") = 0 THEN EXCLUDED."keywords" ELSE "works"."keywords" END,
        "is_oa"    = COALESCE("works"."is_oa", false) OR COALESCE(EXCLUDED."is_oa", false),
        "cited_by" = GREATEST("works"."cited_by", EXCLUDED."cited_by")
      RETURNING "id", "oc_id"`;
    for (const row of res) out.set(row.oc_id, Number(row.id));
  }
  return out;
}

// ── search_events ──────────────────────────────────────────────────────────────────────────────

/**
 * logSearch(opts) → eventId (number) | null. Fail-open.
 *   identity   billing identity ({ userId, keyId, plan:{id}, admin }) or null (anon web)
 *   req        incoming request (for requestContext) — or pass `ctx` directly
 *   surface    SURFACE.*
 *   query / terms
 *   settings   small JSON snapshot (request params or UI settings)
 *   eligible / failed   adapter id lists
 *   coverage   band string
 *   records    the RETURNED page, in displayed order (adapter records or public cards)
 *   scores     optional parallel number[] (0..1 → ×1000); else records[i]._sim / _score
 *   nRaw / nDedup / tookMs / cacheHit / page / experiment
 */
export async function logSearch(opts) {
  try {
    const { identity = null, req, surface, query, terms, settings = null, eligible = [], failed = [],
      coverage = null, records = [], scores = null, nRaw = null, nDedup = null, tookMs = null,
      cacheHit = false, page = 0, experiment = null } = opts;
    const ctx = opts.ctx || requestContext(req);
    const q = clip(query, 2000);
    if (!q) return null;

    const rows = records.map(workRowFrom);
    const ids = rows.length ? await upsertWorks(rows) : new Map();
    const top = [], topSrc = [], sc = [];
    rows.forEach((w, i) => {
      const id = ids.get(w.oc_id);
      if (id == null) return;
      top.push(id);
      topSrc.push(ordinalOf(records[i].source));
      const s = scores ? scores[i] : (records[i]._sim ?? records[i]._score);
      sc.push(typeof s === "number" && Number.isFinite(s) ? Math.round(s * 1000) : -1);
    });
    const anyScore = sc.some((s) => s >= 0);

    const res = await prisma.$queryRaw`
      INSERT INTO "search_events"
        ("query","terms","surface","user_id","key_id","plan","actor","ip_hash","ua","client","tool","settings","experiment",
         "eligible","failed","coverage","n_raw","n_dedup","n_returned","latency_ms","cache_hit","page","top","top_src","scores")
      VALUES (
        ${q}, ${textArr((terms && terms.length ? terms : [q]).map((t) => String(t).slice(0, 500)))}, ${surface}::smallint,
        ${identity?.userId ?? opts.userId ?? null}, ${identity?.keyId ?? null}, ${identity?.plan?.id ?? null},
        ${ctx.actor}, ${ctx.ipHash}, ${ctx.ua}, ${ctx.client}, ${ctx.tool}, ${jsonb(settings)}, ${experiment},
        ${textArr(eligible.map(String))}, ${textArr(failed.map(String))}, ${coverage},
        ${nRaw}::smallint, ${nDedup}::smallint, ${top.length}::smallint, ${tookMs == null ? null : Math.round(tookMs)}::int4,
        ${!!cacheHit}, ${page | 0}::smallint, ${intArr(top)}, ${intArr(topSrc)}, ${intArr(anyScore ? sc : [])}
      )
      RETURNING "id"`;
    return Number(res[0]?.id) || null;
  } catch (err) {
    log.warn("searchLog", "log-search-failed", { err: err?.code || err?.name || "Error", msg: String(err?.message || err).slice(0, 200) });
    return null;
  }
}

// ── search_signals (web) ───────────────────────────────────────────────────────────────────────

// record = the result the user acted on (needs the anonymizeId basis: doi | url | title+year).
export async function logSignal({ eventId, record, rank, action, meta = null }) {
  try {
    if (!record || !Number.isInteger(action)) return false;
    const w = workRowFrom(record);
    const ids = await upsertWorks([w]);
    const workId = ids.get(w.oc_id);
    if (workId == null) return false;
    const ev = Number.isFinite(Number(eventId)) && Number(eventId) > 0 ? BigInt(Math.trunc(Number(eventId))) : null;
    await prisma.$executeRaw`
      INSERT INTO "search_signals" ("event_id","work_id","rank","action","meta")
      VALUES (${ev}, ${workId}, ${Number.isInteger(rank) ? rank : -1}::smallint, ${action}::smallint, ${jsonb(meta)})`;
    return true;
  } catch (err) {
    log.warn("searchLog", "log-signal-failed", { err: err?.code || err?.name || "Error", msg: String(err?.message || err).slice(0, 200) });
    return false;
  }
}

// Page dwell: time spent on the results page before the next search / leaving. Set once.
export async function setDwell({ eventId, ms }) {
  try {
    const id = Number(eventId), v = Math.round(Number(ms));
    if (!(id > 0) || !(v >= 0)) return false;
    await prisma.$executeRaw`UPDATE "search_events" SET "dwell_ms" = ${Math.min(v, 86_400_000)}::int4 WHERE "id" = ${BigInt(id)} AND "dwell_ms" IS NULL`;
    return true;
  } catch { return false; }
}

// ── machine signals (follow-on API calls) ──────────────────────────────────────────────────────

/**
 * logMachineSignal({ identity, req, ref, record, action, meta })
 *   ref      the identifier the caller passed (DOI / DOI URL / PMID / oc_ id / free text)
 *   record   the resolved record when the endpoint found one (preferred — upserts a real work row)
 * Resolves the work (record → upsert; DOI → lookup; else a stub `UNSEEN` row keyed on the ref),
 * then joins to this caller's most recent search within MACHINE_JOIN_WINDOW whose page contained
 * the work. No match → event_id NULL, rank -1 (kept: "verify called on a DOI we never surfaced"
 * is the agent-corpus data). Fail-open.
 */
export async function logMachineSignal({ identity = null, req, ref, record = null, action, meta = null }) {
  try {
    const ctx = requestContext(req);
    let workId = null, unseen = false;
    if (record) {
      const w = workRowFrom(record);
      workId = (await upsertWorks([w])).get(w.oc_id) ?? null;
    }
    const doi = normDoi(ref) || normDoi(record?.doi);
    if (workId == null && doi) {
      const hit = await prisma.$queryRaw`SELECT "id" FROM "works" WHERE lower("doi") = ${doi} LIMIT 1`;
      if (hit[0]) workId = Number(hit[0].id);
    }
    if (workId == null && typeof ref === "string" && ref.startsWith("oc_")) {
      const hit = await prisma.$queryRaw`SELECT "id" FROM "works" WHERE "oc_id" = ${ref} LIMIT 1`;
      if (hit[0]) workId = Number(hit[0].id);
    }
    if (workId == null) {
      // Stub: the agent referenced something no search of ours returned. Keep the ref text as title.
      unseen = true;
      const stub = {
        oc_id: doi ? anonymizeId({ doi }) : `oc_ref_${sha256(String(ref || "")).toString("base64url").slice(0, 16)}`,
        doi, source: "UNSEEN", title: clip(ref, MAX_TEXT), authors: [], year: null, venue: null, type: null,
        abstract: null, keywords: [], url: null, is_oa: null, cited_by: null,
      };
      workId = (await upsertWorks([stub])).get(stub.oc_id) ?? null;
      if (workId == null) return false;
    }

    // Join to the caller's latest search that showed this work. keyId when keyed, else the actor hash.
    const keyId = identity?.keyId && identity.keyId !== "session-admin" ? identity.keyId : null;
    const ev = await prisma.$queryRaw`
      SELECT "id", array_position("top", ${workId}::int4) - 1 AS "rank"
      FROM "search_events"
      WHERE "ts" > now() - ${MACHINE_JOIN_WINDOW}::interval
        AND ${keyId ? Prisma.sql`"key_id" = ${keyId}` : Prisma.sql`"actor" = ${ctx.actor}`}
        AND "top" @> ARRAY[${workId}::int4]
      ORDER BY "ts" DESC LIMIT 1`;
    const eventId = ev[0] ? BigInt(ev[0].id) : null;
    const rank = ev[0] ? Number(ev[0].rank) : -1;
    const m = { ...(meta || {}), ...(unseen ? { unseen: true } : {}), ...(ctx.tool ? { tool: ctx.tool } : {}) };
    await prisma.$executeRaw`
      INSERT INTO "search_signals" ("event_id","work_id","rank","action","meta")
      VALUES (${eventId}, ${workId}, ${rank}::smallint, ${action}::smallint, ${jsonb(m)})`;
    return true;
  } catch (err) {
    log.warn("searchLog", "log-machine-signal-failed", { err: err?.code || err?.name || "Error", msg: String(err?.message || err).slice(0, 200) });
    return false;
  }
}

// De-identify a user's search rows (history clear / account deletion). Rows stay; the link goes.
export async function deidentifyUser(userId) {
  try {
    if (!userId) return 0;
    return await prisma.$executeRaw`UPDATE "search_events" SET "user_id" = NULL WHERE "user_id" = ${userId}`;
  } catch { return 0; }
}

export { ADAPTER_ORDINAL };
