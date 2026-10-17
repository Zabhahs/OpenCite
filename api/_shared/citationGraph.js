// OpenCITE — citation-graph traversal (forward "cited-by" + backward "references").
//
// Approach adapted (clean-room) from neuromechanist/opencite (MIT): citations.py — we
// re-implement the orchestration BEHAVIOUR in JS, no code copied (§6, sprint v0.43).
//
// Server-only (reads env, uses the KV cache + circuit-breaker). Backbone is OpenAlex (we
// already speak it — reuse parseOpenAlexWork/OA_SELECT, the SSOT, so the cards match search);
// OpenCitations is a keyless CC0 fallback for the backward path when the input is a bare DOI
// OpenAlex doesn't know. Semantic Scholar is deliberately NOT wired (keys approval-gated,
// 429s even when keyed — Appendix A.4).
//
// TODO(reuse): when an OpenCitations adapter lands from the capability-tiers adopt list
// (Adapter-Capability-Tiers.md), import it instead of the minimal inline fetch here (SSOT).

import { parseOpenAlexWork, OA_SELECT } from "../../src/adapters/_shared/parseOpenAlex.js";
import { normalizeId } from "../../src/lib/idResolve.js";
import { recordSuccess, recordFailure, isCircuitOpen } from "./adapterHealth.js";
import { readCache, writeCache } from "./cache.js";

const OA_BASE = "https://api.openalex.org/works";
// Seed lookups also need the outbound-reference list + count, which OA_SELECT omits.
// v0.48: + `ids` (doi/pmid/pmcid/mag) so /api/works can return every identifier in one call.
const SEED_SELECT = `${OA_SELECT},referenced_works,referenced_works_count,ids`;

// v0.48 (sprint v0.45 T5): upstream leg-health tally. Every helper that makes an upstream call
// bumps `health.attempted` and, on a genuine failure (network, 5xx, 429, circuit-open skip),
// `health.failed`. A 404 "unknown work" is a SOLD answer, not a failed leg. Callers pass
// `opts.health = { attempted: 0, failed: 0 }`; meter.legBand turns it into a coverage band.
const bump = (health, key) => { if (health) health[key] = (health[key] || 0) + 1; };
// OpenAlex batch-by-ID via `filter=openalex:` is capped at 25 ids per OR-group (live probe,
// openalex.md §A5). per-page maxes at 200 (hyphenated key). Cursor needed past the 10k window.
const OA_BATCH = 25;
const OA_PER_PAGE = 200;
// Distinct circuit-breaker ids so graph health never collides with the search adapters' streaks.
const CB_OA = "OPENALEX_GRAPH";
const CB_OC = "OPENCITATIONS";
// OpenCitations is lookup-only and slow (~900ms warm) → cache hard, 7 days, keyed by doi|dir.
const OC_BASE = "https://api.opencitations.net/index/v2";
const OC_CACHE_TTL = 7 * 24 * 60 * 60;
const OC_TIMEOUT_MS = 8000;

const mailtoParam = (mailto) => {
  // Polite pool wants a contact as a QUERY param — serverless strips the UA header (Appendix B.2).
  const m = mailto || process.env.OPENCITE_MAILTO;
  return m ? `&mailto=${encodeURIComponent(m)}` : "";
};

const oaId = (idUrl) => (idUrl || "").split("/").pop(); // https://openalex.org/W123 → W123

// Is this an OpenAlex work id (W123 / a full openalex.org URL) vs a DOI / other identifier?
const isOpenAlexId = (s) => /^W\d+$/i.test(s) || /openalex\.org\/W/i.test(s);

async function oaFetch(url, signal) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!r.ok) throw new Error(`OpenAlex ${r.status}`);
  return r.json();
}

// Resolve the input id/DOI to its OpenAlex seed work (carrying referenced_works + cited_by_count).
// Returns the raw work object, or null when OpenAlex doesn't know it.
async function resolveSeed(input, { mailto, signal, health } = {}) {
  bump(health, "attempted");
  if (isCircuitOpen(CB_OA)) { bump(health, "failed"); return null; }
  const sel = `select=${SEED_SELECT}`;
  // DOI path-lookups keep literal slashes (verified live; encoding the slash breaks the lookup).
  // `input` is already normalized to a bare DOI / OA id by the public entry points below.
  const path = isOpenAlexId(input) ? oaId(input) : `doi:${input}`;
  try {
    const work = await oaFetch(`${OA_BASE}/${path}?${sel}${mailtoParam(mailto)}`, signal);
    recordSuccess(CB_OA);
    return work || null;
  } catch (err) {
    // v0.48: a 404 is OpenAlex answering "I don't know this work" — a successful leg and a
    // legitimate (billable) answer. Anything else is an outage leg (sprint v0.45 T5 finding).
    if (/OpenAlex 404/.test(err?.message || "")) { recordSuccess(CB_OA); return null; }
    recordFailure(CB_OA);
    bump(health, "failed");
    return null;
  }
}

// Chunk an array into ≤size slices.
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Hydrate a list of OpenAlex work ids into UnifiedResult cards via batched `filter=openalex:`.
// allSettled across chunks: a single failed chunk degrades coverage, never sinks the call.
async function hydrate(ids, { mailto, signal, health } = {}) {
  if (!ids.length) return [];
  const groups = chunk(ids, OA_BATCH);
  if (isCircuitOpen(CB_OA)) { groups.forEach(() => { bump(health, "attempted"); bump(health, "failed"); }); return []; }
  const sel = `select=${OA_SELECT}`;
  const settled = await Promise.allSettled(
    groups.map((group) => {
      bump(health, "attempted");
      return oaFetch(`${OA_BASE}?filter=openalex:${group.join("|")}&${sel}&per-page=${OA_BATCH}${mailtoParam(mailto)}`, signal);
    })
  );
  const out = [];
  let anyOk = false;
  for (const s of settled) {
    if (s.status === "fulfilled") {
      anyOk = true;
      (s.value.results || []).forEach((w, i) => out.push(parseOpenAlexWork(w, `ref-${out.length + i}`)));
    } else {
      bump(health, "failed");
    }
  }
  anyOk ? recordSuccess(CB_OA) : recordFailure(CB_OA);
  return out;
}

// ── OpenCitations fallback (backward path only, bare-DOI input OpenAlex missed) ──────────────
// Best-effort + cached. Returns minimal cards (doi + url) — enough to be useful, no full hydrate.
async function ocReferences(doi, { signal, health } = {}) {
  const cacheK = `oc:cite:v1:refs:${doi}`;
  const cached = await readCache(cacheK);
  if (cached) return cached; // a cache hit is not an upstream leg
  bump(health, "attempted");
  if (isCircuitOpen(CB_OC)) { bump(health, "failed"); return []; }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OC_TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    const r = await fetch(`${OC_BASE}/references/doi:${doi}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`OpenCitations ${r.status}`);
    const rows = await r.json();
    // `cited` is a space-separated multi-id string ("omid:… doi:… openalex:… pmid:…"). Pull DOI.
    const cards = (Array.isArray(rows) ? rows : [])
      .map((row) => (row.cited || "").match(/doi:(\S+)/)?.[1])
      .filter(Boolean)
      .map((d, i) => ({
        id: `oc-ref-${i}`,
        source: "OPENCITATIONS",
        title: d, // no metadata from OC; the DOI stands in until hydrated elsewhere
        doi: d,
        url: `https://doi.org/${d}`,
        type: "article",
      }));
    recordSuccess(CB_OC);
    await writeCache(cacheK, cards, OC_CACHE_TTL);
    return cards;
  } catch {
    recordFailure(CB_OC);
    bump(health, "failed");
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Stable comparator: higher citedBy first, then newer year — null-safe (nulls sink, never throw).
const byImpact = (a, b) => (b.citedBy ?? -1) - (a.citedBy ?? -1) || (Number(b.year) || 0) - (Number(a.year) || 0);
const byYear = (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0) || (b.citedBy ?? -1) - (a.citedBy ?? -1);

// Dedup a card list on its strongest stable id (DOI, else OpenAlex id, else url).
function dedupCards(cards) {
  const seen = new Set();
  const out = [];
  for (const c of cards) {
    const k = c.doi || c.id || c.url;
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    out.push(c);
  }
  return out;
}

/**
 * getReferences(input, opts) → UnifiedResult[]
 * Backward edges: the works THIS work cites. OpenAlex `referenced_works[]` → batch-hydrate;
 * OpenCitations backfill when OpenAlex doesn't know a bare DOI. Pipeline order (Appendix B.1):
 * dedup → sort → truncate — never truncate the raw (unsorted) reference list first.
 *
 * @param {string} input  DOI or OpenAlex work id
 * @param {{limit?:number, sort?:"impact"|"year", mailto?:string, signal?:AbortSignal}} [opts]
 */
export async function getReferences(rawInput, opts = {}) {
  const input = isOpenAlexId(rawInput) ? rawInput : normalizeId(rawInput);
  const limit = clampLimit(opts.limit);
  const seed = await resolveSeed(input, opts);
  let cards = [];
  if (seed?.referenced_works?.length) {
    cards = await hydrate(seed.referenced_works.map(oaId), opts);
  }
  // Fallback only when OpenAlex gave us nothing AND we were handed a DOI to look up.
  if (!cards.length && !isOpenAlexId(input)) {
    cards = await ocReferences(input, opts);
  }
  const sorted = dedupCards(cards).sort(opts.sort === "year" ? byYear : byImpact);
  return sorted.slice(0, limit);
}

/**
 * getCitations(input, opts) → UnifiedResult[]
 * Forward edges: the works that CITE this one. OpenAlex `filter=cites:` returns them directly
 * with cited_by_count inline. Pipeline order: dedup → filter(minCitations) → sort → truncate.
 *
 * @param {string} input  DOI or OpenAlex work id
 * @param {{limit?:number, minCitations?:number, sort?:"impact"|"year", mailto?:string, signal?:AbortSignal}} [opts]
 */
export async function getCitations(rawInput, opts = {}) {
  const input = isOpenAlexId(rawInput) ? rawInput : normalizeId(rawInput);
  const limit = clampLimit(opts.limit);
  const minCitations = Number(opts.minCitations) > 0 ? Number(opts.minCitations) : 0;
  const seed = await resolveSeed(input, opts);
  if (!seed?.id) return [];
  if (isCircuitOpen(CB_OA)) { bump(opts.health, "attempted"); bump(opts.health, "failed"); return []; }
  const id = oaId(seed.id);

  const sortField = opts.sort === "year" ? "publication_year:desc" : "cited_by_count:desc";
  const sel = `select=${OA_SELECT}`;
  const cards = [];
  let cursor = "*";
  try {
    // Page with cursor (mandatory past the 10k window) until we have enough or run out.
    while (cards.length < limit && cursor) {
      const perPage = Math.min(OA_PER_PAGE, limit - cards.length);
      bump(opts.health, "attempted");
      const data = await oaFetch(
        `${OA_BASE}?filter=cites:${id}&sort=${sortField}&per-page=${perPage}&cursor=${encodeURIComponent(cursor)}&${sel}${mailtoParam(opts.mailto)}`,
        opts.signal
      );
      (data.results || []).forEach((w, i) => cards.push(parseOpenAlexWork(w, `cite-${cards.length + i}`)));
      cursor = data.meta?.next_cursor || null;
      if (!data.results?.length) break;
    }
    recordSuccess(CB_OA);
  } catch {
    recordFailure(CB_OA);
    bump(opts.health, "failed");
  }

  let out = dedupCards(cards);
  if (minCitations) out = out.filter((c) => (c.citedBy ?? 0) >= minCitations);
  out.sort(opts.sort === "year" ? byYear : byImpact);
  return out.slice(0, limit);
}

/**
 * getWork(input, opts) → { card, ids } | null   (v0.48, /api/works)
 * One work by DOI or OpenAlex id: the UnifiedResult card (same parser as search, so cards match)
 * plus every identifier OpenAlex knows for it. null when OpenAlex doesn't know the work (a sold
 * "not found", not a failed leg — see resolveSeed). opts.health is tallied like the graph calls.
 *
 * @param {string} input  DOI or OpenAlex work id
 * @param {{mailto?:string, signal?:AbortSignal, health?:{attempted:number, failed:number}}} [opts]
 */
export async function getWork(rawInput, opts = {}) {
  const input = isOpenAlexId(rawInput) ? rawInput : normalizeId(rawInput);
  const seed = await resolveSeed(input, opts);
  if (!seed?.id) return null;
  const strip = (v, re) => (v ? String(v).replace(re, "") : null);
  return {
    card: parseOpenAlexWork(seed, "work"),
    ids: {
      doi: strip(seed.ids?.doi || seed.doi, /^https?:\/\/doi\.org\//i),
      pmid: strip(seed.ids?.pmid, /^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//i),
      pmcid: strip(seed.ids?.pmcid, /^https?:\/\/www\.ncbi\.nlm\.nih\.gov\/pmc\/articles\//i),
      openalex: oaId(seed.id),
    },
  };
}

// Limit guard — 1..200, default 25 (mirrors the search endpoint's posture).
function clampLimit(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v) || v < 1) return 25;
  return Math.min(v, 200);
}
