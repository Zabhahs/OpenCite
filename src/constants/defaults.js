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
  curatedJournals: DEFAULT_CURATED_JOURNALS,
  enabledSources: {}
};
