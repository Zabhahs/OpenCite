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

// Full-text "search inside" endpoint — matches OCR'd page text, not just metadata.
const FTS_ENDPOINT = "https://be-api.us.archive.org/ia-pub-fts-api/";

// FTS highlight snippets wrap the match in {{{ }}} and carry raw OCR whitespace.
function cleanSnippet(text) {
  return String(text || "")
    .replace(/\{\{\{|\}\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Map an advancedsearch.php metadata doc to a UnifiedResult.
function mapMetadataDoc(d, offset, i) {
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
    _identifier: d.identifier || "",
  };
}

// Map a full-text-search hit (OCR page match) to a UnifiedResult.
function mapFtsHit(h, query, offset, i) {
  const f = h.fields || {};
  const identifier = toArray(f.identifier)[0] || "";
  const creator = toArray(f.meta_creator);
  const subjects = toArray(f.meta_subjectSorter);
  const collections = toArray(f.meta_collection);
  const downloads = parseInt(toArray(f.meta_downloads)[0], 10) || 0;
  const yearMatch = String(toArray(f.meta_year)[0] || toArray(f.meta_date)[0] || "").match(/\d{4}/);
  const type = inferTypeFromCollections(collections) || "textual";
  const snippet = cleanSnippet(toArray(h.highlight && h.highlight.text)[0]);
  const page = toArray(toArray(f.page_num)[0])[0];

  return {
    id: `ia-${identifier || `fts-${offset}-${i}`}`, source: "IA",
    title: toArray(f.meta_title)[0] || "Untitled",
    authors: creator,
    year: yearMatch ? yearMatch[0] : "",
    journal: "",
    publisher: toArray(f.meta_publisher)[0] || "Internet Archive",
    volume: "",
    issue: "",
    pages: page != null ? String(page) : "",
    doi: "",
    isbn: "",
    // Deep-link opens the in-book search so the matched pages are visible.
    url: identifier
      ? `https://archive.org/details/${identifier}?q=${encodeURIComponent(query)}`
      : "",
    abstract: snippet ? `…${snippet}…` : "",
    isOA: true,
    type,
    language: toArray(f.meta_languageSorter)[0] || "",
    keywords: subjects,
    subjects,
    citedBy: downloads > 0 ? downloads : null,
    previewImage: identifier ? `https://archive.org/services/img/${identifier}` : "",
    _identifier: identifier,
  };
}

export const INTERNET_ARCHIVE_ADAPTER = {
  id: "IA", name: "Internet Archive",
  tagline: "42M+ texts · scholarly, historical, ephemeral",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["aggregator", "library", "audiovisual-archive"],
  contentType: ["textual", "audio", "primary-source", "ephemera"],
  color: { bg: "bg-stone-700", text: "text-stone-50" }, needsKey: false,
  capability: {
    // Dual-endpoint: advancedsearch metadata + full-text "search inside" (OCR page text).
    protocol: "rest-json", fulltext: true, pagination: "page", totalCount: true, maxWindow: 10000, auth: "none",
    // citedBy carries download counts, not citations — Sprint 2 gates whether to honor it.
    rankFields: { abstract: "full", subjects: "full", citedBy: true },
    serverSafe: true,
    corpusSize: 40000000, // ~40M texts (conservative); archive.org
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;

    // Phase D — field-scoped retrieval. The bare query spans creator/text too; scoping to
    // title/description/subject keeps author-name matches out. authorSearch reverts to all-field.
    const clean = query.replace(/[:"()[\]{}^~*?\\]/g, " ").replace(/\s+/g, " ").trim();
    const scoped = settings.authorSearch
      ? clean
      : `(title:(${clean}) OR description:(${clean}) OR subject:(${clean}))`;
    const metaQ = `${scoped} AND mediatype:texts`;
    const flParams = FIELDS.map(f => `fl[]=${f}`).join("&");
    const metaParams = `q=${encodeURIComponent(metaQ)}&${flParams}&sort=downloads+desc&rows=${pageSize}&page=${page}&output=json`;
    const metaUrl = `https://archive.org/advancedsearch.php?${metaParams}`;

    // Metadata search alone misses books whose match lives only in the OCR'd page text
    // (e.g. a phrase mentioned inside a chapter but absent from title/description/subject).
    // The FTS endpoint covers that "search inside" case. Author search stays metadata-only,
    // since FTS matches body text rather than the creator field.
    const ftsUrl = `${FTS_ENDPOINT}?q=${encodeURIComponent(clean)}&size=${pageSize}&from=${offset}`;
    const runFts = !settings.authorSearch && clean.length > 0;

    const metaPromise = fetch(metaUrl).then(async (r) => {
      if (!r.ok) throw new Error(`Internet Archive ${r.status}`);
      return r.json();
    });
    const ftsPromise = runFts
      ? fetch(ftsUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      : Promise.resolve(null);

    const [metaData, ftsData] = await Promise.all([metaPromise, ftsPromise]);

    const metaDocs = metaData.response?.docs || [];
    const metaResults = metaDocs.map((d, i) => mapMetadataDoc(d, offset, i));

    const ftsHits = ftsData?.hits?.hits || [];
    const ftsResults = ftsHits.map((h, i) => mapFtsHit(h, query, offset, i));

    // Merge: metadata records first (richer descriptions), then FTS hits not already seen.
    const byIdentifier = new Map();
    const results = [];
    for (const r of metaResults) {
      if (r._identifier) byIdentifier.set(r._identifier, r);
      results.push(r);
    }
    for (const r of ftsResults) {
      if (r._identifier && byIdentifier.has(r._identifier)) {
        // Same item surfaced by both — enrich the metadata record with the matched
        // page snippet if it lacks an abstract of its own.
        const existing = byIdentifier.get(r._identifier);
        if (!existing.abstract && r.abstract) existing.abstract = r.abstract;
        continue;
      }
      if (r._identifier) byIdentifier.set(r._identifier, r);
      results.push(r);
    }
    for (const r of results) delete r._identifier;

    const metaTotal = metaData.response?.numFound || 0;
    const ftsTotalRaw = ftsData?.hits?.total;
    const ftsTotal = typeof ftsTotalRaw === "object" ? (ftsTotalRaw?.value || 0) : (ftsTotalRaw || 0);
    const hasMore =
      offset + metaResults.length < metaTotal ||
      offset + ftsResults.length < ftsTotal;

    return { results, hasMore };
  }
};
