import { ADAPTER_CATEGORY } from "../constants/vocabulary.js";
import { AbstractAdapter } from "./_shared/base.js";
import { normalizeRecord, createDedupMap } from "./_shared/normalize.js";

// Core adapters
import { DOAJ_ADAPTER } from "./core/doaj.js";
import { OPENALEX_ADAPTER } from "./core/openalex.js";
import { CROSSREF_ADAPTER } from "./core/crossref.js";
import { CURATED_JOURNALS_ADAPTER } from "./core/curatedJournals.js";

// Extension adapters
import { SEMANTIC_SCHOLAR_ADAPTER } from "./extensions/semanticScholar.js";
import {
  EUROPEANA_ADAPTER,
  MET_ADAPTER,
  SMITHSONIAN_ADAPTER,
  DPLA_ADAPTER,
  RIJKSMUSEUM_ADAPTER,
  INTERNET_ARCHIVE_ADAPTER,
  BDPI_ADAPTER,
  GALLICA_ADAPTER,
  THAQALAYN_ADAPTER,
  NCBI_ADAPTER,
  OPENCONTEXT_ADAPTER,
  NORTHWESTERN_ADAPTER,
  PRINCETON_DPUL_ADAPTER,
  PANGAEA_ADAPTER,
  OPENNEURO_ADAPTER,
  ENA_ADAPTER,
  // v.18 — SOW heritage adapters
  CHRONICLING_AMERICA_ADAPTER,
  ONB_ADAPTER,
  BDH_ADAPTER,
  BNF_API_ADAPTER,
  BRITISH_LIBRARY_ADAPTER,
  DELPHER_ADAPTER,
  LC_DATASETS_ADAPTER,
  MEXICANA_ADAPTER,
  NLS_ADAPTER,
} from "./extensions/index.js";

/**
 * ADAPTERS — the canonical ordered registry.
 * Order determines render order in the results view.
 * Core adapters are always enabled; extensions are opt-in.
 */
export const ADAPTERS = [
  // Core — always on
  DOAJ_ADAPTER,
  OPENALEX_ADAPTER,
  CROSSREF_ADAPTER,
  CURATED_JOURNALS_ADAPTER,
  // Extensions — scholarly
  SEMANTIC_SCHOLAR_ADAPTER,
  // Extensions — cultural & primary sources
  EUROPEANA_ADAPTER,
  MET_ADAPTER,
  SMITHSONIAN_ADAPTER,
  DPLA_ADAPTER,
  RIJKSMUSEUM_ADAPTER,
  INTERNET_ARCHIVE_ADAPTER,
  BDPI_ADAPTER,
  // Extensions — sciences
  NCBI_ADAPTER,
  OPENCONTEXT_ADAPTER,
  // Extensions — Islamicate / heritage
  GALLICA_ADAPTER,
  THAQALAYN_ADAPTER,
  // Extensions — v.11
  NORTHWESTERN_ADAPTER,
  PRINCETON_DPUL_ADAPTER,
  PANGAEA_ADAPTER,
  OPENNEURO_ADAPTER,
  ENA_ADAPTER,
  // Extensions — v.18 SOW heritage adapters
  CHRONICLING_AMERICA_ADAPTER,  // Library of Congress historic newspapers
  ONB_ADAPTER,                  // Austrian National Library
  BDH_ADAPTER,                  // Biblioteca Digital Hispánica / BNE
  BNF_API_ADAPTER,              // BnF catalog metadata (distinct from Gallica)
  BRITISH_LIBRARY_ADAPTER,      // British National Bibliography (SPARQL)
  DELPHER_ADAPTER,              // KB / Delpher — Dutch National Library
  LC_DATASETS_ADAPTER,          // Library of Congress selected datasets
  MEXICANA_ADAPTER,             // Mexican Ministry of Culture OAI-PMH
  NLS_ADAPTER,                  // National Library of Scotland Data Foundry
];

/** True if this adapter runs by default without user opt-in. */
export const isAdapterDefaultEnabled = (adapter) =>
  adapter.category === ADAPTER_CATEGORY.CORE;

/**
 * runSearch — registry wrapper around adapter.search().
 *
 * Pipeline (in order):
 *   1. adapter.search()          — raw upstream fetch
 *   2. AbstractAdapter.sanitize() — null safety, UnifiedResult contract
 *   3. normalizeRecord()          — NCR enforcement, type canonicalization,
 *                                   author parsing, request-scoped dedup
 *
 * Single chokepoint for all upstream data.
 * Phase 2 (rate limiting): KV cache check/write goes here — see hook comments.
 * Phase 2 (billing):       BillingContext.deduct() goes here after KV check.
 * Phase 5 (telemetry):     log query + adapterKey here for KV buffering.
 */
export const runSearch = async (adapter, query, settings, opts = {}) => {
  // PHASE 2 HOOK — KV cache check (slot before upstream fetch)
  // const cacheKey = `opencite:${adapterKey}:${sha1(query)}`;
  // const cached = await kv.get(cacheKey);
  // if (cached) return JSON.parse(cached);

  const adapterKey = adapter.id || adapter.name || "unknown";
  const dedupMap = createDedupMap();

  const raw = await adapter.search(query, settings, opts);
  const rawResults = Array.isArray(raw) ? raw : (raw.results || []);
  const hasMore = Array.isArray(raw) ? false : !!raw.hasMore;

  const results = rawResults
    .map(AbstractAdapter.sanitize)
    .map((r) => normalizeRecord(r, adapterKey, dedupMap))
    .filter(Boolean); // null = duplicate within this request — drop it

  // PHASE 2 HOOK — KV cache write (slot after results built)
  // await kv.set(cacheKey, JSON.stringify({ results, hasMore }), { ex: 300 });

  return { results, hasMore };
};

export { ADAPTER_CATEGORY };
