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

import { ADAPTERS, runSearch, isAdapterDefaultEnabled } from "../src/adapters/index.js";
import { scoreResults, meaningfulTerms } from "../src/lib/scoring.js";
import { buildMLA, buildAPA, segmentsToPlain, exportAs } from "../src/lib/citations.js";
import { DEFAULT_SETTINGS } from "../src/constants/defaults.js";

// Adapters that are safe to invoke server-side (direct fetch, JSON, no proxy/DOMParser).
const SERVER_SAFE_IDS = new Set(["OPENALEX", "CROSSREF", "DOAJ", "CURATED"]);

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ADAPTER_TIMEOUT_MS = 12000;
const VALID_CITE = new Set(["bibtex", "ris", "csl-json"]);

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

// Public, trimmed view of a normalized record: UnifiedResult fields + _score + citations.
const toPublicResult = (r, citeFormats) => {
  const citations = {
    mla: segmentsToPlain(buildMLA(r)),
    apa: segmentsToPlain(buildAPA(r)),
  };
  for (const fmt of citeFormats) {
    citations[fmt] = fmt === "csl-json" ? JSON.parse(exportAs(r, fmt)) : exportAs(r, fmt);
  }
  return {
    id: r.id,
    source: r.source,
    title: r.title,
    authors: r.authors,
    year: r.year,
    journal: r.journal,
    publisher: r.publisher,
    volume: r.volume,
    issue: r.issue,
    pages: r.pages,
    doi: r.doi,
    url: r.url,
    abstract: r.abstract,
    isOA: !!r.isOA,
    type: r.type,
    editors: r.editors,
    keywords: r.keywords,
    subjects: r.subjects,
    language: r.language,
    citedBy: r.citedBy ?? null,
    score: Number((r._score ?? 0).toFixed(4)),
    lowConfidence: !!r._lowConfidence,
    citations,
  };
};

const USAGE = {
  endpoint: "/api/search",
  method: "GET",
  params: {
    q: "required — query string; separate multiple keywords with ;",
    limit: `optional — 1..${MAX_LIMIT} (default ${DEFAULT_LIMIT})`,
    sources: "optional — comma-separated subset of OPENALEX,CROSSREF,DOAJ,CURATED",
    authors: "optional — 1/true for author-inclusive search",
    mailto: "optional — email for the polite pool",
    cite: "optional — extra formats: bibtex,ris,csl-json",
    format: "optional — json (default) | mla | apa | bibtex | ris | csl-json",
  },
  example: "/api/search?q=machine%20learning&limit=10&cite=bibtex",
};

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
    return sendJson(res, 200, { ok: true, usage: USAGE });
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

  // Source selection — restricted to the server-safe allowlist.
  const requested = firstParam(req.query?.sources)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const selectedIds = requested.length
    ? requested.filter((id) => SERVER_SAFE_IDS.has(id))
    : [...SERVER_SAFE_IDS];

  if (!selectedIds.length) {
    return sendJson(res, 400, {
      error: "No valid sources selected.",
      allowed: [...SERVER_SAFE_IDS],
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

  const sourcesMeta = {};

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
          const merged = batches.flatMap((b) => b.results || []);
          const seen = new Set();
          results = merged.filter((r) => {
            if (!r.doi) return true;
            if (seen.has(r.doi)) return false;
            seen.add(r.doi);
            return true;
          });
        } else {
          ({ results } = await withTimeout(
            runSearch(adapter, terms[0], settings, { offset: 0 }),
            ADAPTER_TIMEOUT_MS,
            adapter.id
          ));
        }
        sourcesMeta[adapter.id] = { count: results.length, error: null };
        return results;
      } catch (err) {
        sourcesMeta[adapter.id] = { count: 0, error: err.message || "Search failed" };
        return [];
      }
    })
  );

  // Cross-adapter DOI dedup — keep the highest-scored copy of each DOI.
  // (Scoring runs once over the full candidate set so IDF is consistent.)
  const allRaw = perAdapter.flat();
  // v.29 Sprint 2 — pooled heterogeneous set: resolve each result's capability by source
  // so the scorer can gate the citation tiebreak and apply the thin-source prior per-source.
  const capBySource = Object.fromEntries(ADAPTERS.map((a) => [a.id, a.capability]));
  const scored = scoreResults(allRaw, terms, (r) => capBySource[r.source]);

  const byDoi = new Map();
  const deduped = [];
  for (const r of scored) {
    if (!r.doi) {
      deduped.push(r);
      continue;
    }
    const existing = byDoi.get(r.doi);
    if (!existing) {
      byDoi.set(r.doi, r);
      deduped.push(r);
    } else if ((r._score || 0) > (existing._score || 0)) {
      byDoi.set(r.doi, r);
      deduped[deduped.indexOf(existing)] = r;
    }
  }

  // Global low-confidence gate (v0.27 useFilters parity): if any genuine match
  // exists anywhere, drop every zero-score loose match; only when nothing
  // anywhere matched do we surface best guesses, flagged lowConfidence.
  const meaningful = meaningfulTerms(terms);
  const anyGenuine = meaningful.length && deduped.some((r) => r._score > 0);
  let finalResults;
  if (!meaningful.length) {
    finalResults = deduped;
  } else if (anyGenuine) {
    finalResults = deduped.filter((r) => r._score > 0);
  } else {
    finalResults = deduped.map((r) => ({ ...r, _lowConfidence: true }));
  }

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
    lowConfidence: meaningful.length > 0 && !anyGenuine,
    count: publicResults.length,
    totalCandidates: deduped.length,
    tookMs: Date.now() - startMs,
    sources: sourcesMeta,
    results: publicResults,
  });
}
