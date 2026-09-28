export const STORAGE_NS = "opencite";
export const HISTORY_MAX = 50;

export const INITIAL_PAGE_SIZE = 3;
export const LOAD_MORE_PAGE_SIZE = 5;

export const REGION_ORDER = [
  "global", "north-america", "europe", "latin-america",
  "mena", "north-africa", "sahel", "west-africa", "sub-saharan-africa",
  "central-asia", "south-asia", "east-asia"
];

export const DEFAULT_CURATED_JOURNALS = [
  { name: "Ecological Informatics", issn: "1574-9541" },
  { name: "Ecosphere", issn: "2150-8925" },
  { name: "Frontiers in Marine Science", issn: "2296-7745" },
  { name: "PeerJ", issn: "2167-8359" }
];

export const DEFAULT_SETTINGS = {
  // v0.34 — DPLA/Smithsonian/Rijksmuseum keys removed: those sources are now
  // backend-keyed (env vars, via api/_shared/serverKeys.js) or keyless (Rijksmuseum).
  // Any stale values in existing users' saved settings are inert (no adapter reads them).
  openAlexKey: "",
  crossrefEmail: "",
  // s2Key removed v0.42 — Semantic Scholar adapter quarantined; stale saved values are inert.
  // TRANSITIONAL (v0.34): Europeana keeps a per-user key as a CLIENT FALLBACK — the
  // browser calls api.europeana.eu directly with this until the project-level
  // EUROPEANA_API_KEY env is provisioned; then it flips to backend-only like the others.
  // TODO(future sprint): drop europeanaKey once that env key lands.
  europeanaKey: "",
  // CORE/NDLI keep per-user keys — the one intentional client-side key set (TOS-items.md D7/D8).
  coreKey: "",   // CORE.ac.uk — free at core.ac.uk/services/api
  ndliKey: "",   // NDLI — free at ndl.iitkgp.ac.in
  curatedJournals: DEFAULT_CURATED_JOURNALS,
  enabledSources: {},
  // "unified" = single interleaved list across all adapters (default)
  // "source"  = per-adapter sections (power-user / source view)
  viewMode: "unified",
  // v0.44 — engine teardown: the ranking-layer settings keys were removed with the
  // engine (see docs/wiki/99-Archive/_quarantine/v0_44_engine/). Stale values in
  // saved settings are inert (nothing reads them).

  // When false (default): adapters query content fields only (title/abstract/keywords),
  // so a query like "memon" no longer returns papers merely authored by someone named Memon.
  // When true: adapters revert to author-inclusive / all-field search.
  authorSearch: false,
};
