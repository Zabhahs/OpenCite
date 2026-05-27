import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";

// ── Collection → type mapping ───────────────────────────────────────────────
// IA collections that reliably signal a document type.
// Keys are lowercase collection identifiers; values are UnifiedResult type strings.
const COLLECTION_TYPE_MAP = {
  // Scholarly / preprint repositories
  "arxiv":                      "article",
  "pubmed":                     "article",
  "pubmedcentral":              "article",
  "jstor_early_journal_content":"article",
  "biodiversitylibrary":        "article",
  // Books
  "internetarchivebooks":       "book",
  "americana":                  "book",
  "toronto":                    "book",
  "gutenberg":                  "book",
  "millionbooks":               "book",
  "opensource":                 "book",
  "inlibrary":                  "book",
  "printdisabled":              "book",
  // Government / reports
  "us_government_documents":    "report",
  "governmentpublications":     "report",
  "usfederalcourts":            "report",
  // Theses
  "thesis":                     "thesis",
  // Newspapers / periodicals
  "newspapers":                 "primary-source",
  "magazine_rack":              "primary-source",
  "periodicals":                "primary-source",
};

function inferTypeFromCollections(collections) {
  if (!collections) return null;
  const arr = Array.isArray(collections) ? collections : [collections];
  for (const c of arr) {
    const match = COLLECTION_TYPE_MAP[String(c).toLowerCase()];
    if (match) return match;
  }
  return null;
}

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (val != null && val !== "") return [val];
  return [];
}

// ── Expanded field list ─────────────────────────────────────────────────────
const FIELDS = [
  "identifier", "title", "creator", "date", "description",
  "mediatype", "collection", "subject", "language",
  "downloads", "publisher", "year", "volume", "isbn",
  "licenseurl", "avg_rating", "num_reviews",
];

export const INTERNET_ARCHIVE_ADAPTER = {
  id: "IA", name: "Internet Archive",
  tagline: "42M+ texts · scholarly, historical, ephemeral",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["aggregator", "library", "audiovisual-archive"],
  contentType: ["textual", "audio", "primary-source", "ephemera"],
  color: { bg: "bg-stone-700", text: "text-stone-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;

    const q = query + " AND mediatype:texts";
    const flParams = FIELDS.map(f => `fl[]=${f}`).join("&");
    const params = `q=${encodeURIComponent(q)}&${flParams}&sort=downloads+desc&rows=${pageSize}&page=${page}&output=json`;

    const r = await fetch(`https://archive.org/advancedsearch.php?${params}`);
    if (!r.ok) throw new Error(`Internet Archive ${r.status}`);
    const data = await r.json();
    const docs = data.response?.docs || [];

    const results = docs.map((d, i) => {
      const creator = toArray(d.creator);
      const desc = Array.isArray(d.description) ? d.description[0] : (d.description || "");
      const subjects = toArray(d.subject);
      const collections = toArray(d.collection);
      const downloads = typeof d.downloads === "number" ? d.downloads : parseInt(d.downloads, 10) || 0;
      const yearMatch = String(d.year || d.date || "").match(/\d{4}/);
      const type = inferTypeFromCollections(collections) || "textual";

      return {
        id: `ia-${d.identifier || `${offset}-${i}`}`, source: "IA",
        title: Array.isArray(d.title) ? d.title[0] : (d.title || "Untitled"),
        authors: creator,
        year: yearMatch ? yearMatch[0] : "",
        journal: "",
        publisher: toArray(d.publisher)[0] || "Internet Archive",
        volume: d.volume || "",
        issue: "",
        pages: "",
        doi: "",
        isbn: toArray(d.isbn)[0] || "",
        url: d.identifier ? `https://archive.org/details/${d.identifier}` : "",
        abstract: stripHtml(desc),
        isOA: true,
        type,
        language: toArray(d.language)[0] || "",
        keywords: subjects,
        subjects,
        citedBy: downloads > 0 ? downloads : null,
        previewImage: d.identifier ? `https://archive.org/services/img/${d.identifier}` : "",
      };
    });
    return { results, hasMore: offset + results.length < (data.response?.numFound || 0) };
  }
};
