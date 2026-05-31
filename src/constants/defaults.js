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
  europeanaKey: "",
  openAlexKey: "",
  crossrefEmail: "",
  s2Key: "",
  smithsonianKey: "",
  dplaKey: "",
  rijksKey: "",
  // v.29 — South Asia adapters
  coreKey: "",   // CORE.ac.uk — free at core.ac.uk/services/api
  ndliKey: "",   // NDLI — free at ndl.iitkgp.ac.in
  curatedJournals: DEFAULT_CURATED_JOURNALS,
  enabledSources: {},
  // "unified" = single ranked list across all adapters (default)
  // "source"  = per-adapter sections (power-user / source view)
  viewMode: "unified",
  synonyms: true,
  semanticSearch: true,
  // When false (default): adapters query content fields only (title/abstract/keywords),
  // so a query like "memon" no longer returns papers merely authored by someone named Memon.
  // When true: adapters revert to author-inclusive / all-field search.
  rrfSemanticWeight: 0.4,
  // RRF fusion weight for the Lexical↔Semantic slider when semanticSearch is on.
  // 0.0 = pure lexical (BM25F), 1.0 = pure semantic (embeddings).
  // Default 0.4 reproduces the hardcoded 0.6/0.4 balance.
  searchDefaultsV31: true,
  // One-time migration flag — marks that v.31 always-on search defaults (semantic + synonym) have been applied.
  authorSearch: false,
};
