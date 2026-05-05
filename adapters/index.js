import { ADAPTER_CATEGORY } from "../constants/vocabulary.js";
import { AbstractAdapter } from "./_shared/base.js";

// Core adapters
import { DOAJ_ADAPTER } from "./core/doaj.js";
import { OPENALEX_ADAPTER } from "./core/openalex.js";
import { CROSSREF_ADAPTER } from "./core/crossref.js";
import { CURATED_JOURNALS_ADAPTER } from "./core/curatedJournals.js";

// Extension adapters
import {
  SEMANTIC_SCHOLAR_ADAPTER,
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
  ENA_ADAPTER
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
];

/** True if this adapter runs by default without user opt-in. */
export const isAdapterDefaultEnabled = (adapter) =>
  adapter.category === ADAPTER_CATEGORY.CORE;

/**
 * runSearch — registry wrapper around adapter.search().
 *
 * This is the single chokepoint for all upstream data.
 * Phase 2 (rate limiting): call BillingContext.deduct() here before returning.
 * Phase 5 (telemetry): log query + source here for KV buffering.
 *
 * Sanitize runs on every result via AbstractAdapter.sanitize() to enforce the
 * UnifiedResult contract and prevent .trim() runtime errors on bad upstream data.
 */
export const runSearch = async (adapter, query, settings, opts = {}) => {
  const raw = await adapter.search(query, settings, opts);
  const results = Array.isArray(raw)
    ? raw.map(AbstractAdapter.sanitize)
    : (raw.results || []).map(AbstractAdapter.sanitize);
  const hasMore = Array.isArray(raw) ? false : !!raw.hasMore;
  return { results, hasMore };
};

export { ADAPTER_CATEGORY };
