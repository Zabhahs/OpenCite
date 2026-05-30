import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

const BASE = "https://www.wikidata.org/w/api.php";
const HEADERS = {
  "Api-User-Agent": "OpenCITE/0.24 (https://citation.today; shahbaz.citationtoday@gmail.com)",
  "Accept": "application/json",
  "Accept-Encoding": "gzip",
};

// Common language Q-IDs → ISO 639-1 to avoid a network lookup for this field
const LANG_MAP = {
  Q1860: "en",  Q150: "fr",   Q188: "de",   Q1321: "es",  Q652: "it",
  Q7850: "zh",  Q1412: "pt",  Q7737: "ru",  Q9240: "fa",  Q13955: "ar",
  Q809:  "pl",  Q7411: "nl",  Q36510: "tr", Q11059: "ko", Q397: "la",
  Q9610: "bn",  Q9027: "sv",  Q58:   "zh",  Q9063: "ca",
};

const getFirst      = (c, p) => c?.[p]?.[0]?.mainsnak?.datavalue?.value;
const getString     = (c, p) => { const v = getFirst(c, p); return typeof v === "string" ? v : (v?.text || ""); };
const getItemId     = (c, p) => getFirst(c, p)?.id || "";
const getItemIds    = (c, p) => (c?.[p] || []).map(s => s?.mainsnak?.datavalue?.value?.id).filter(Boolean);
const getStrings    = (c, p) => (c?.[p] || []).map(s => s?.mainsnak?.datavalue?.value).filter(v => typeof v === "string" && v);
const getYear       = (c, p) => String(getFirst(c, p)?.time || "").match(/\d{4}/)?.[0] || "";

export const WIKIDATA_ADAPTER = {
  id: "WIKIDATA", name: "Wikidata",
  tagline: "Linked open data · structured scholarly metadata",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["aggregator", "scholarly-index"],
  contentType: ["peer-reviewed", "structured-data"],
  color: { bg: "bg-sky-900", text: "text-sky-50" },
  needsKey: false,

  capability: {
    // MediaWiki CirrusSearch + wbgetentities batches. abstract = one-line entity description (label).
    protocol: "mediawiki", fulltext: false, pagination: "offset", totalCount: true, maxWindow: 10000, auth: "none",
    rankFields: { abstract: "sparse", subjects: "full", citedBy: false },
  },

  search: async (query, _settings, opts = {}) => {
    const offset = opts.offset || 0;
    const rows   = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;

    // 1 — CirrusSearch: find scholarly articles matching the query
    const r1 = await fetch(
      `${BASE}?action=query&list=search` +
      `&srsearch=${encodeURIComponent(query + " haswbstatement:P31=Q13442814")}` +
      `&srlimit=${rows}&sroffset=${offset}&format=json&origin=*`,
      { headers: HEADERS }
    );
    if (!r1.ok) throw new Error(`Wikidata search ${r1.status}`);
    const searchData = await r1.json();

    const hits  = searchData.query?.search || [];
    const total = searchData.query?.searchinfo?.totalhits || 0;
    if (hits.length === 0) return { results: [], hasMore: false };

    const qids = hits.map(h => h.title).filter(t => /^Q\d+$/.test(t));
    if (qids.length === 0) return { results: [], hasMore: false };

    // 2 — Batch fetch full entity data for all matched articles
    const r2 = await fetch(
      `${BASE}?action=wbgetentities` +
      `&ids=${qids.join("|")}&props=labels|descriptions|claims&languages=en&format=json&origin=*`,
      { headers: HEADERS }
    );
    if (!r2.ok) throw new Error(`Wikidata entities ${r2.status}`);
    const entData  = await r2.json();
    const entities = entData.entities || {};

    // Collect Q-IDs of referenced items: journals, publishers, subjects.
    // For authors: prefer P2093 (plain string); only collect P50 item Q-IDs when P2093 is absent.
    const refIds = new Set();
    for (const qid of qids) {
      const c = entities[qid]?.claims || {};
      const journalId   = getItemId(c, "P1433");
      const publisherId = getItemId(c, "P123");
      if (journalId)   refIds.add(journalId);
      if (publisherId) refIds.add(publisherId);
      getItemIds(c, "P921").slice(0, 5).forEach(id => refIds.add(id));
      if ((c["P2093"] || []).length === 0) {
        getItemIds(c, "P50").slice(0, 5).forEach(id => refIds.add(id));
      }
    }

    // 3 — Batch fetch labels for all referenced items (journals, publishers, subjects, authors)
    let refLabels = {};
    if (refIds.size > 0) {
      const r3 = await fetch(
        `${BASE}?action=wbgetentities` +
        `&ids=${[...refIds].join("|")}&props=labels&languages=en&format=json&origin=*`,
        { headers: HEADERS }
      );
      if (r3.ok) {
        const refData = await r3.json();
        for (const [id, ent] of Object.entries(refData.entities || {})) {
          refLabels[id] = ent.labels?.en?.value || "";
        }
      }
    }

    const label = (id) => refLabels[id] || "";

    const results = qids.map(qid => {
      const ent = entities[qid];
      if (!ent || ent.missing) return null;
      const c = ent.claims || {};

      const title       = getString(c, "P1476") || ent.labels?.en?.value || "Untitled";
      const doi         = getString(c, "P356");
      const journalId   = getItemId(c, "P1433");
      const publisherId = getItemId(c, "P123");
      const langId      = getItemId(c, "P407");

      const p2093 = getStrings(c, "P2093");
      const authors = p2093.length > 0
        ? p2093
        : getItemIds(c, "P50").slice(0, 5).map(label).filter(Boolean);

      const subjects = getItemIds(c, "P921").map(label).filter(Boolean);

      return {
        id:        `wd-${qid}`,
        source:    "WIKIDATA",
        title,
        authors,
        year:      getYear(c, "P577"),
        journal:   label(journalId),
        publisher: label(publisherId),
        volume:    getString(c, "P478"),
        issue:     getString(c, "P433"),
        pages:     getString(c, "P304"),
        doi,
        url:       doi ? `https://doi.org/${doi}` : `https://www.wikidata.org/wiki/${qid}`,
        abstract:  ent.descriptions?.en?.value || "",
        isOA:      true,
        type:      "article",
        language:  LANG_MAP[langId] || "",
        subjects,
        keywords:  [],
      };
    }).filter(Boolean);

    return { results, hasMore: offset + results.length < total };
  }
};
