import { ADAPTER_CATEGORY } from "../constants/vocabulary.js";
import { AbstractAdapter } from "./_shared/base.js";
import { normalizeRecord, createDedupMap } from "./_shared/normalize.js";
import { log } from "../lib/log.js";

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
  LC_DATASETS_ADAPTER,
  MEXICANA_ADAPTER,
} from "./extensions/index.js";

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
  CHRONICLING_AMERICA_ADAPTER,
  ONB_ADAPTER,
  BDH_ADAPTER,
  BNF_API_ADAPTER,
  BRITISH_LIBRARY_ADAPTER,
  LC_DATASETS_ADAPTER,
  MEXICANA_ADAPTER,
];

export const isAdapterDefaultEnabled = (adapter) =>
  adapter.category === ADAPTER_CATEGORY.CORE;

/**
 * runSearch — registry wrapper around adapter.search().
 * v.19: logged at start / adapter-error / empty / parse-ok.
 */
export const runSearch = async (adapter, query, settings, opts = {}) => {
  const adapterKey = adapter.id || adapter.name || "unknown";
  const dedupMap = createDedupMap();
  const startMs = Date.now();

  log(adapterKey, "start", { q: query, offset: opts.offset || 0 });

  let raw;
  try {
    raw = await adapter.search(query, settings, opts);
  } catch (err) {
    log.err(adapterKey, "adapter-error", {
      err: err.name || "Error",
      msg: err.message || String(err),
      ms: Date.now() - startMs,
    });
    throw err;
  }

  const rawResults = Array.isArray(raw) ? raw : (raw.results || []);
  const hasMore = Array.isArray(raw) ? false : !!raw.hasMore;

  const results = rawResults
    .map(AbstractAdapter.sanitize)
    .map((r) => normalizeRecord(r, adapterKey, dedupMap))
    .filter(Boolean);

  if (results.length === 0) {
    log(adapterKey, "empty", { rawCount: rawResults.length });
  } else {
    log(adapterKey, "parse-ok", { items: results.length, ms: Date.now() - startMs });
  }

  return { results, hasMore };
};

export { ADAPTER_CATEGORY };
