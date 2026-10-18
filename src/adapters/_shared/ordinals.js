// OpenCITE — adapter ordinal SSOT (v0.50)
//
// Stable small integers for adapter ids, used to pack the per-position source of a search
// result page into `search_events.top_src` (INTEGER[]). Chosen over a lookup table so a
// stored array stays decodable offline from the repo alone.
//
// RULES: APPEND-ONLY. Never renumber, never reuse a number. Quarantined adapters keep their
// slot so historical rows still decode. New adapters take the next free integer.
// Shared by the server writer (api/_shared/searchLog.js) and the admin views.

export const ADAPTER_ORDINAL = Object.freeze({
  // Core
  DOAJ: 0,
  OPENALEX: 1,
  CROSSREF: 2,
  CURATED: 3,
  // Cultural & primary sources
  EUROPEANA: 4,
  MET: 5,
  SMITHSONIAN: 6,
  DPLA: 7,
  RIJKS: 8,
  IA: 9,
  // Sciences
  NCBI: 10,
  // Humanities worldwide
  OAPEN: 11,
  OPENEDITION: 12,
  OPEN_LIBRARY: 13,
  CORE: 14,
  NDLI: 15,
  GALLICA: 16,
  NORTHWESTERN: 17,
  PRINCETON_DPUL: 18,
  CHRONICLING_AMERICA: 19,
  ONB: 20,
  BNF_API: 21,
  LC_DATASETS: 22,
  WIKIDATA: 23,
  // Quarantined (v0.38 / v0.44 / v0.46) — slots reserved so old rows decode
  THAQALAYN: 24,
  OPENCONTEXT: 25,
  PANGAEA: 26,
  LA_REFERENCIA: 27,
  BASE: 28,
  SCIELO: 29,
  OPENNEURO: 30,
  ENA: 31,
  BDH: 32,
  BRITISH_LIBRARY: 33,
  MEXICANA: 34,
  S2: 35,
  // Sentinel: a work referenced by a machine call that no search of ours ever surfaced
  UNSEEN: 255,
});

export const UNKNOWN_ORDINAL = -1;
export const ordinalOf = (adapterId) =>
  ADAPTER_ORDINAL[String(adapterId || "").toUpperCase()] ?? UNKNOWN_ORDINAL;

// Reverse map for decoding / admin views.
export const ADAPTER_BY_ORDINAL = Object.freeze(
  Object.fromEntries(Object.entries(ADAPTER_ORDINAL).map(([id, n]) => [n, id]))
);
