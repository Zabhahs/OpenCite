// OpenCITE — Public REST search API
// Route: /api/search
// Runtime: Node.js (default for api/*.js without an edge config export)
//
// Runs the same retrieval + normalize + BM25F ranking pipeline the UI uses
// (runSearch + scoreResults + buildMLA/APA), so API results match the app and
// the endpoint doubles as a headless test harness for relevance work.
//
// v1 covers the core scholarly adapters only (OpenAlex, Crossref, DOAJ,
// Curated). These use plain fetch() to public JSON APIs — no browser proxy and
// no DOMParser — so they run cleanly server-side. Heritage/SRU adapters depend
// on api/proxy.js + DOMParser and are out of scope until those are made
// server-aware (tracked in the roadmap).
//
// GET  /api/search?q=<query>
//   q          required — search query. Multi-keyword: separate with ";".
//   limit      optional — max merged results (default 25, max 100).
//   sources    optional — comma-separated adapter IDs to include
//                         (subset of the caller's plan tier).
//   authors    optional — "1"/"true" flips adapters to author-inclusive search.
//   mailto     optional — email for the OpenAlex/Crossref polite pool
//                         (defaults to env OPENCITE_MAILTO).
//   cite       optional — extra citation formats per result, comma-separated:
//                         bibtex,ris,csl-json (mla + apa are always included).
//   format     optional — "json" (default) | "mla" | "apa" | "bibtex" | "ris"
//                         | "csl-json". Non-json returns a text/plain (or JSON
//                         array for csl-json) bibliography of all results.
//
// Auth + billing (WS3, wired v0.32): every request must present a valid API key
// (x-api-key header or ?key=) — FAIL-CLOSED, no anonymous access. The key maps to
// a billing identity (apiAuth.resolveApiKey); the search is metered through the
// credit ledger (preAuthorize → coverage-prorated settle), tier-gated, and
// rate-limited. The pipeline NEVER bills a failed search (refund-on-throw).
//
// Admin path: an admin identity (master key, or a user with plan='admin') runs at
// 0 credits, no rate cap, all-tier, and may pass ?debug=1 for an ORIGIN-REVEALING
// envelope (per-result source + raw score + pipeline telemetry). debug is gated
// strictly on the server-derived identity.admin — a non-admin ?debug=1 is a silent
// no-op, so origin-blindness can never be pierced by a normal caller.

import { ADAPTERS, runSearch } from "../src/adapters/index.js";
import { scoreResults, meaningfulTerms, applyConfidenceGate } from "../src/lib/scoring.js";
import { doiKey, titleFingerprint, dedupFirstWins, dedupHighestScore } from "../src/lib/dedup.js";
import { exportAs } from "../src/lib/citations.js";
import { DEFAULT_SETTINGS } from "../src/constants/defaults.js";
import { toPublicResult } from "./_shared/publicResult.js";
import { toDebugResult } from "./_shared/debugResult.js";
import { computeCoverage } from "./_shared/coverage.js";
import { buildUsage, DEFAULT_LIMIT, MAX_LIMIT, CITE_FORMATS, FORMATS } from "./_shared/apiContract.js";
import { resolveApiKey, resolveSessionAdmin } from "./_shared/apiAuth.js";
import { allowedSourceIds } from "./_shared/plans.js";
import { checkRateLimit } from "./_shared/ratelimit.js";
import { cacheKey, readCache, writeCache } from "./_shared/cache.js";
import { preAuthorize, settle, refund, getBalance } from "./_shared/billing.js";
import { serverInjectedKeys } from "./_shared/serverKeys.js";
import { recordSuccess, recordFailure, isCircuitOpen, circuitBreakerStats } from "./_shared/adapterHealth.js";

// DRY-2: the server-safe set is DERIVED from the registry — `capability.serverSafe`
// lives next to each adapter's transport code, not hardcoded here.
const SERVER_SAFE_IDS = new Set(
  ADAPTERS.filter((a) => a.capability?.serverSafe).map((a) => a.id)
);

const ADAPTER_TIMEOUT_MS = 12000;
const VALID_CITE = new Set(CITE_FORMATS);

const isTruthy = (v) => v === "1" || v === "true" || v === "yes";

// First query param value, whether req.query gives a string or string[].
const firstParam = (v) => (Array.isArray(v) ? v[0] : v) ?? "";

// Stable per-caller id for the rate limiter when no keyId is available (keyId is
// always set post-auth, so this is belt-and-suspenders). First hop of x-forwarded-for.
const clientIp = (req) => {
  const xff = req.headers?.["x-forwarded-for"];
  const first = Array.isArray(xff) ? xff[0] : xff;
  return (first || "").split(",")[0].trim() || "anon";
};

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

// Race an adapter run against a timeout so one slow source can't hang the function.
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);

// Charge a search against a known coverage band: pre-authorize the full unit cost,
// then settle down to the coverage-prorated net (refunding the diff). Used on the
// cache-hit path, where there's no fan-out to gate between the two phases.
// Admin/master (cost 0) → { ok:true, creditsCharged:0 }, ledger untouched.
async function chargeForBand(identity, band) {
  const cost = identity.plan.creditCost;
  const pre = await preAuthorize(identity.userId, cost);
  if (!pre.ok) return { ok: false, creditsCharged: 0 };
  const creditsCharged = await settle(identity.userId, cost, band, {
    freeBelowBand: identity.plan.freeBelowBand,
  });
  return { ok: true, creditsCharged };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed. Use GET." });
  }

  // 1. Identity — fail-closed. Retires the old OPENCITE_API_KEY endpoint gate; auth
  // is now per-identity (apiAuth maps x-api-key/?key= → billing identity, or null).
  // Fallback: no API key but an allowlisted Auth.js admin session → admin identity
  // (cost 0, debug/simple unlocked) so the browser admin console works without a key.
  // Non-admin sessions stay null → standard 401 (endpoint remains key-only otherwise).
  const identity = (await resolveApiKey(req)) || (await resolveSessionAdmin(req));
  if (!identity) {
    return sendJson(res, 401, { error: "Invalid or missing API key." });
  }

  const q = firstParam(req.query?.q).trim();
  if (!q) {
    return sendJson(res, 200, { ok: true, usage: buildUsage() });
  }

  // Origin-revealing debug — SERVER-DERIVED gate. A non-admin ?debug=1 is treated as
  // absent (silent no-op): standard origin-blind cards, no telemetry, normal cache.
  const debug = !!identity.admin && isTruthy(firstParam(req.query?.debug));

  // v0.36 DIAGNOSTIC — DEVELOPER-ONLY raw-pipeline mode. Same SERVER-DERIVED admin gate
  // as debug: a non-admin ?simple=1 is a silent no-op (falls through to the production
  // pipeline). Simple mode runs the SAME fan-out, then SKIPS dedup/score/confidence-gate/
  // coverage and returns the raw merged pool in fan-out order with `source` VISIBLE — so
  // we can tell whether 403s/timeouts/poor relevance originate upstream (adapter) or in
  // our post-retrieve pipeline. Bypasses cache (always fresh). Admin cost is 0, so no
  // settle/refund applies. NOT a user feature — gate or remove before any public release.
  const simpleMode = !!identity.admin && isTruthy(firstParam(req.query?.simple));

  const startMs = Date.now();

  // Limit
  let limit = parseInt(firstParam(req.query?.limit), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  // Extra citation formats
  const citeFormats = firstParam(req.query?.cite)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => VALID_CITE.has(s));

  const format = (firstParam(req.query?.format).trim().toLowerCase()) || "json";
  // Validate format up-front (before any fan-out / charge) so a malformed request is
  // never billed and never triggers a search. FORMATS is the apiContract SSOT.
  if (!FORMATS.includes(format)) {
    return sendJson(res, 400, { error: `Unknown format "${format}".`, allowed: FORMATS });
  }

  // 2. Source selection — intersect the request with the plan's tier (allowedSourceIds
  // restricts the server-safe set to "core" or "all"). Origin-blind: we never echo the
  // internal source catalog, so an unrecognized/out-of-tier selection just yields a
  // generic 400 (no upstream names leaked).
  const tierIds = new Set(allowedSourceIds(identity.plan, [...SERVER_SAFE_IDS]));
  const requested = firstParam(req.query?.sources)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const selectedIds = requested.length
    ? requested.filter((id) => tierIds.has(id))
    : [...tierIds];

  if (!selectedIds.length) {
    return sendJson(res, 400, {
      error: "No valid sources selected. Omit the 'sources' parameter to search the full available library.",
    });
  }

  // v0.34: env keys for the three keyed CC0 sources — lifted to a const so the same
  // object is reused in settings (server branch injection) AND the presence-guard below.
  const envKeys = serverInjectedKeys();

  // v0.34: drop a keyed source from eligibility when its env key is unset — prevents
  // it from counting as a "failed adapter" (no false coverage-band drop) and lets
  // Europeana/DPLA/Smithsonian auto-activate the moment their env var is set (no redeploy).
  const KEYED_ENV = { EUROPEANA: "europeanaKey", DPLA: "dplaKey", SMITHSONIAN: "smithsonianKey" };
  const eligible = ADAPTERS.filter(
    (a) => tierIds.has(a.id) && selectedIds.includes(a.id)
         && (!KEYED_ENV[a.id] || !!envKeys[KEYED_ENV[a.id]])
  );

  // v0.38 (T1, F-208): chronic-failure circuit-breaker. Drop any adapter whose
  // circuit is open (FAILURE_STREAK_THRESHOLD consecutive throws on this function
  // instance) BEFORE fan-out + coverage. A circuit-opened adapter is treated as if
  // it was never eligible — NOT as a failed adapter — so a permanently-broken source
  // can no longer pin the coverage band below `full` and under-charge every search.
  const cbDropped = eligible.filter((a) => isCircuitOpen(a.id));
  const adapters = eligible.filter((a) => !isCircuitOpen(a.id));

  // Settings — defaults + per-request overrides.
  const settings = {
    ...DEFAULT_SETTINGS,
    ...envKeys,   // v0.34: backend env keys for keyed CC0 sources (server branch)
    authorSearch: isTruthy(firstParam(req.query?.authors)),
    crossrefEmail: firstParam(req.query?.mailto) || process.env.OPENCITE_MAILTO || DEFAULT_SETTINGS.crossrefEmail,
  };

  // Multi-keyword parsing — mirrors useSearch.
  const terms = q.split(";").map((s) => s.trim()).filter(Boolean);
  const isMulti = terms.length > 1;

  // 3. Rate limit — ephemeral KV burst cap, SEPARATE from credits, fail-open if KV is
  // down/unconfigured. Admin (max:0) always returns ok.
  const rl = await checkRateLimit(identity.keyId ?? clientIp(req), identity.plan);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return sendJson(res, 429, { error: "Rate limit exceeded. Please retry later." });
  }

  // 4. Cache (json + non-debug only). Charge-on-hit using the band stored in the
  // payload, so a hit is billed the SAME coverage-prorated amount as the original.
  // Debug always runs fresh and is never cached (it must never poison the public
  // cache with origin-revealing cards).
  const ck = cacheKey({
    query: q,
    sources: selectedIds,
    limit,
    authors: settings.authorSearch,
    format,
  });
  if (format === "json" && !debug && !simpleMode) {
    const cached = await readCache(ck);
    if (cached) {
      const charge = await chargeForBand(identity, cached.coverage);
      if (!charge.ok) return sendJson(res, 402, { error: "Insufficient credits." });
      const balance = await getBalance(identity.userId);
      const meta = { creditsCharged: charge.creditsCharged };
      if (balance != null) meta.balance = balance;
      return sendJson(res, 200, { ...cached, tookMs: Date.now() - startMs, meta });
    }
  }

  // 5. Pre-authorize — gates the expensive fan-out (402 if short). Admin cost 0 → ok,
  // ledger untouched.
  const pre = await preAuthorize(identity.userId, identity.plan.creditCost);
  if (!pre.ok) return sendJson(res, 402, { error: "Insufficient credits." });

  // 6. Fan-out + score + dedup + coverage — wrapped so ANY throw refunds the pre-auth
  // (R1: never bill a failed search).
  let limited, coverageBand, deduped, debugMeta, lowConfidence;
  try {
    // Track which eligible adapters errored/timed out, for the corpus-weighted coverage
    // signal (an empty result set is NOT a failure — it means "no match", full coverage).
    const failedAdapters = [];
    // Per-adapter telemetry (B.3) — collected during the existing fan-out; surfaced
    // only on the admin debug path, ignored by the public path.
    const adapterStats = [];

    // Run every adapter independently; one failure never sinks the request.
    const perAdapter = await Promise.all(
      adapters.map(async (adapter) => {
        const t0 = Date.now();
        try {
          let results;
          if (isMulti) {
            const batches = await withTimeout(
              Promise.all(terms.map((t) => runSearch(adapter, t, settings, { offset: 0 }))),
              ADAPTER_TIMEOUT_MS,
              adapter.id
            );
            results = dedupFirstWins(batches.flatMap((b) => b.results || []), doiKey, new Set());
          } else {
            ({ results } = await withTimeout(
              runSearch(adapter, terms[0], settings, { offset: 0 }),
              ADAPTER_TIMEOUT_MS,
              adapter.id
            ));
          }
          adapterStats.push({ id: adapter.id, ms: Date.now() - t0, candidates: results.length, errored: false });
          recordSuccess(adapter.id); // v0.38 T1: reset circuit-breaker streak on a non-throwing run
          return results;
        } catch {
          failedAdapters.push(adapter);
          adapterStats.push({ id: adapter.id, ms: Date.now() - t0, candidates: 0, errored: true });
          recordFailure(adapter.id); // v0.38 T1: advance circuit-breaker streak; opens after FAILURE_STREAK_THRESHOLD
          return [];
        }
      })
    );

    const allRaw = perAdapter.flat();

    // v0.36 SIMPLE MODE — raw merged pool, in fan-out order. SKIPS score/dedup/gate/
    // coverage entirely. `source` is NOT stripped (we need to know which adapter produced
    // what). No `_score`, no `inferred-*`, no anonymized id. perAdapter telemetry +
    // failedAdapters isolate adapter-level failures (403/timeout) from pipeline ones.
    // Admin-only + cost 0, so we return straight out — no settle, no cache write.
    if (simpleMode) {
      const rawResults = allRaw.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        source: r.source,
        year: r.year || null,
        authorCount: Array.isArray(r.authors) ? r.authors.length : null,
        citedBy: r.citedBy ?? null,
      }));
      return sendJson(res, 200, {
        query: q,
        terms,
        simpleMode: true,
        pipeline: "raw",
        count: rawResults.length,
        perAdapter: adapterStats,
        failedAdapters: failedAdapters.map((a) => a.id),
        tookMs: Date.now() - startMs,
        results: rawResults,
        note: "Unprocessed adapter output, in fan-out order. Developer diagnostic only.",
      });
    }

    // Score once over the full candidate set so IDF is consistent, then dedup keeping
    // the highest-scored copy of each work (DOI first, then same-paper title fingerprint).
    const capBySource = Object.fromEntries(ADAPTERS.map((a) => [a.id, a.capability]));
    const scored = scoreResults(allRaw, terms, (r) => capBySource[r.source]);
    const afterDoi = dedupHighestScore(scored, doiKey);
    deduped = dedupHighestScore(afterDoi, titleFingerprint);

    // Global low-confidence gate (v0.27 useFilters parity): if any genuine match exists
    // anywhere, drop every zero-score loose match; only when nothing matched do we surface
    // best guesses, flagged lowConfidence.
    const gated = applyConfidenceGate(deduped, meaningfulTerms(terms));
    const finalResults = gated.results;
    lowConfidence = gated.lowConfidence;

    // Corpus-weighted, bucketed coverage band (origin-blind health signal). Denominator =
    // the eligible set for THIS request, so coverage is honest relative to what was searched.
    const cov = computeCoverage(adapters, failedAdapters);
    coverageBand = cov.band;

    finalResults.sort((a, b) => (b._score || 0) - (a._score || 0));
    limited = finalResults.slice(0, limit);

    if (debug) {
      debugMeta = {
        perAdapter: adapterStats,
        dedup: { raw: scored.length, afterDoi: afterDoi.length, afterTitle: deduped.length },
        coverage: { rawPercent: Math.round(cov.coverage * 1000) / 10, failedCount: failedAdapters.length, band: cov.band },
        // v0.38 T1: circuit-breaker visibility (admin-only). `circuitBreaker` is the
        // streak snapshot for every tracked adapter; `cbDropped` lists ids dropped from
        // eligibility this request because their circuit is open.
        circuitBreaker: circuitBreakerStats(),
        cbDropped: cbDropped.map((a) => a.id),
      };
    }
  } catch {
    await refund(identity.userId, identity.plan.creditCost);
    return sendJson(res, 500, { error: "Search failed." });
  }

  // 7. Settle against the realized coverage band (refunds the unavailable-portion diff;
  // freeBelowBand waives a sub-threshold answer entirely).
  const creditsCharged = await settle(identity.userId, identity.plan.creditCost, coverageBand, {
    freeBelowBand: identity.plan.freeBelowBand,
  });
  const balance = await getBalance(identity.userId);

  // Non-JSON formats — flat bibliography of the ranked results. Still metered; billing
  // headers carry the charge. (Non-json is not cached — text body ≠ structured payload,
  // and debug cards don't apply since exportAs renders from the raw record.)
  if (format !== "json") {
    res.setHeader("X-OpenCITE-Credits", String(creditsCharged));
    if (balance != null) res.setHeader("X-OpenCITE-Balance", String(balance));
    if (format === "csl-json") {
      const arr = limited.map((r) => JSON.parse(exportAs(r, "csl-json")));
      return sendJson(res, 200, arr);
    }
    // format is already validated against FORMATS, so this is mla|apa|bibtex|ris.
    const sep = format === "bibtex" || format === "ris" ? "\n\n" : "\n";
    const text = limited.map((r) => exportAs(r, format)).join(sep);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end(text);
  }

  // 8. Render — admin debug gets origin-REVEALING cards; everyone else origin-blind.
  const renderCard = debug ? toDebugResult : toPublicResult;
  const results = limited.map((r) => renderCard(r, citeFormats));

  const meta = { creditsCharged };
  if (balance != null) meta.balance = balance;
  if (debug) meta.debug = debugMeta;

  // Public body (no per-caller meta) — this is what gets cached + charge-on-hit reuses.
  const body = {
    query: q,
    terms,
    coverage: coverageBand,
    lowConfidence,
    count: results.length,
    totalCandidates: deduped.length,
    tookMs: Date.now() - startMs,
    results,
  };

  // 9. Cache the PUBLIC payload (json + non-debug). Best-effort, fail-open.
  if (format === "json" && !debug) await writeCache(ck, body);

  return sendJson(res, 200, { ...body, meta });
}
