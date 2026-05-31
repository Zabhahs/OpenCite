import { scoreResults } from "./src/lib/scoring.js";
import { INTERNET_ARCHIVE_ADAPTER } from "./src/adapters/extensions/internetArchive.js";
import { OPENALEX_ADAPTER } from "./src/adapters/core/openalex.js";

const terms = ["shaikh"];
const doc = { title: "shaikh book list", abstract: "", subjects: [] };
const iaHigh = { id: "ia1", source: "IA", ...doc, citedBy: 231971 };
const oaHigh = { id: "oa1", source: "OA", ...doc, citedBy: 231971 };

const getCap = (r) =>
  r.source === "IA" ? INTERNET_ARCHIVE_ADAPTER.capability : OPENALEX_ADAPTER.capability;

const [ia] = scoreResults([iaHigh], terms, getCap);
const [oa] = scoreResults([oaHigh], terms, getCap);
const [iaZero] = scoreResults([{ ...iaHigh, citedBy: 0 }], terms, getCap);
const [oaZero] = scoreResults([{ ...oaHigh, citedBy: 0 }], terms, getCap);

const iaBonus = +(ia._score - iaZero._score).toFixed(4);
const oaBonus = +(oa._score - oaZero._score).toFixed(4);

console.log(JSON.stringify({
  ia_citedBy_capability: INTERNET_ARCHIVE_ADAPTER.capability.rankFields.citedBy,
  oa_citedBy_capability: OPENALEX_ADAPTER.capability.rankFields.citedBy,
  ia_citation_bonus: iaBonus, // expect 0 after fix
  oa_citation_bonus: oaBonus, // expect 0.3 (CITED_BY_CAP), unchanged
  PASS: iaBonus === 0 && oaBonus === 0.3,
}, null, 2));
