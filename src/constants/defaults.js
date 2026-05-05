export const STORAGE_NS = "opencite";
export const HISTORY_MAX = 50;

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
