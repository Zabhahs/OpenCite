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
//                         (subset of OPENALEX,CROSSREF,DOAJ,CURATED).
//   authors    optional — "1"/"true" flips adapters to author-inclusive search.
//   mailto     optional — email for the OpenAlex/Crossref polite pool
//                         (defaults to env OPENCITE_MAILTO).
//   cite       optional — extra citation formats per result, comma-separated:
//                         bibtex,ris,csl-json (mla + apa are always included).
//   format     optional — "json" (default) | "mla" | "apa" | "bibtex" | "ris"
//                         | "csl-json". Non-json returns a text/plain (or JSON
//                         array for csl-json) bibliography of all results.
//
// Auth: open by default. If env OPENCITE_API_KEY is set, requests must send a
// matching key via the x-api-key header or ?key= query param.

import { ADAPTERS, runSearch } from "../src/adapters/index.js";
import { scoreResults, meaningfulTerms, applyConfidenceGate } from "../src/lib/scoring.js";
import { doiKey, titleFingerprint, dedupFirstWins, dedupHighestScore } from "../src/lib/dedup.js";
import { exportAs } from "../src/lib/citations.js";
import { DEFAULT_SETTINGS } from "../src/constants/defaults.js";
import { toPublicResult } from "./_shared/publicResult.js";
import { computeCoverage } from "./_shared/coverage.js";
import { buildUsage, DEFAULT_LIMIT, MAX_LIMIT, CITE_FORMATS } from "./_shared/apiContract.js";

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

// `toPublicResult` (origin-blind card) now lives in _shared/publicResult.js and the
// self-doc `usage` payload is generated from _shared/apiContract.js (DRY-4).

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

  // Optional API-key gate — only enforced when OPENCITE_API_KEY is configured.
  const requiredKey = process.env.OPENCITE_API_KEY;
  if (requiredKey) {
    const provided = req.headers["x-api-key"] || firstParam(req.query?.key);
    if (provided !== requiredKey) {
      return sendJson(res, 401, { error: "Invalid or missing API key." });
    }
  }

  const q = firstParam(req.query?.q).trim();
  if (!q) {
    return sendJson(res, 200, { ok: true, usage: buildUsage() });
  }

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

  // Source selection — restricted to the derived server-safe set. Origin-blind: we
  // never echo the internal source catalog, so an unrecognized selection just yields a
  // generic 400 (no upstream names leaked).
  const requested = firstParam(req.query?.sources)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const selectedIds = requested.length
    ? requested.filter((id) => SERVER_SAFE_IDS.has(id))
    : [...SERVER_SAFE_IDS];

  if (!selectedIds.length) {
    return sendJson(res, 400, {
      error: "No valid sources selected. Omit the 'sources' parameter to search the full available library.",
    });
  }

  const adapters = ADAPTERS.filter(
    (a) => SERVER_SAFE_IDS.has(a.id) && selectedIds.includes(a.id)
  );

  // Settings — defaults + per-request overrides.
  const settings = {
    ...DEFAULT_SETTINGS,
    authorSearch: isTruthy(firstParam(req.query?.authors)),
    crossrefEmail: firstParam(req.query?.mailto) || process.env.OPENCITE_MAILTO || DEFAULT_SETTINGS.crossrefEmail,
  };

  // Multi-keyword parsing — mirrors useSearch.
  const terms = q.split(";").map((s) => s.trim()).filter(Boolean);
  const isMulti = terms.length > 1;

  // Track which eligible adapters errored/timed out, for the corpus-weighted coverage
  // signal (an empty result set is NOT a failure — it means "no match", full coverage).
  // We keep the adapter objects (not ids/messages) so coverage.js can weight by corpusSize
  // and no upstream name ever reaches the response (origin-blind).
  const failedAdapters = [];

  // Run every adapter independently; one failure never sinks the request.
  const perAdapter = await Promise.all(
    adapters.map(async (adapter) => {
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
        return results;
      } catch {
        failedAdapters.push(adapter);
        return [];
      }
    })
  );

  // Score once over the full candidate set so IDF is consistent, then dedup keeping
  // the highest-scored copy of each work (see below).
  const allRaw = perAdapter.flat();
  // v.29 Sprint 2 — pooled heterogeneous set: resolve each result's capability by source
  // so the scorer can gate the citation tiebreak and apply the thin-source prior per-source.
  const capBySource = Object.fromEntries(ADAPTERS.map((a) => [a.id, a.capability]));
  const scored = scoreResults(allRaw, terms, (r) => capBySource[r.source]);

  // Pooled dedup keeping the highest-scored copy: DOI first, then the same-paper title
  // fingerprint (catches one work registered under multiple DOIs — e.g. JSTOR + publisher).
  const deduped = dedupHighestScore(dedupHighestScore(scored, doiKey), titleFingerprint);

  // Global low-confidence gate (v0.27 useFilters parity): if any genuine match exists
  // anywhere, drop every zero-score loose match; only when nothing matched do we surface
  // best guesses, flagged lowConfidence. (R10 fix: use the gate's own lowConfidence — the
  // old inline `meaningful`/`anyGenuine` refs were undefined and 500'd every JSON response.)
  const { results: finalResults, lowConfidence } = applyConfidenceGate(
    deduped,
    meaningfulTerms(terms)
  );

  // Corpus-weighted, bucketed coverage band (origin-blind health signal — replaces the
  // old per-source `degraded`/`sources` meta). Denominator = the eligible set for THIS
  // request, so coverage is honest relative to what was searched. Only the band leaves
  // the server; the raw %/failed-count/upstream names never do (coverage.js SSOT).
  const { band: coverage } = computeCoverage(adapters, failedAdapters);

  finalResults.sort((a, b) => (b._score || 0) - (a._score || 0));
  const limited = finalResults.slice(0, limit);
  const publicResults = limited.map((r) => toPublicResult(r, citeFormats));

  // Non-JSON formats — return a flat bibliography of the ranked results.
  if (format !== "json") {
    if (format === "csl-json") {
      const arr = limited.map((r) => JSON.parse(exportAs(r, "csl-json")));
      return sendJson(res, 200, arr);
    }
    if (format === "mla" || format === "apa" || format === "bibtex" || format === "ris") {
      const sep = format === "bibtex" || format === "ris" ? "\n\n" : "\n";
      const body = limited.map((r) => exportAs(r, format)).join(sep);
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end(body);
    }
    return sendJson(res, 400, {
      error: `Unknown format "${format}".`,
      allowed: ["json", "mla", "apa", "bibtex", "ris", "csl-json"],
    });
  }

  return sendJson(res, 200, {
    query: q,
    terms,
    coverage,
    lowConfidence,
    count: publicResults.length,
    totalCandidates: deduped.length,
    tookMs: Date.now() - startMs,
    results: publicResults,
  });
}
