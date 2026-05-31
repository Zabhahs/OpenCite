import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { proxiedFetch } from "../_shared/proxy.js";

// NDLI REST API — National Digital Library of India (IIT Kharagpur, Govt of India).
// 90M+ items from 350+ institutions: history, philosophy, literature, art, social sciences,
// in English and major Indian languages (Hindi, Bengali, Tamil, Urdu, etc.).
//
// Metadata follows Dublin Core. Fields arrive as string OR array depending on
// the source record — all field access below is defensive to handle both shapes.
//
// Key required — free at https://ndl.iitkgp.ac.in (register → My Account → API key).
// Key passed as ?api-key= query param. No public CORS headers → proxiedFetch required.
// Pagination: start/size (offset/limit). Response: message.total + message.records[].
// Docs: https://ndl.iitkgp.ac.in/document/static/ndl-api-documentation.pdf
//
// v0.34 — serverSafe is intentionally ABSENT (≡ false) per TOS-items.md D8: NDLI's terms
// restrict programmatic access to individual, per-user credentials, so it is excluded from
// the /api/search server product + MCP. needsKey stays true (intentional per-user key).
export const NDLI_ADAPTER = {
  id: "NDLI", name: "NDLI",
  tagline: "90M+ items from 350+ Indian institutions · history, literature & arts",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["south-asia"],
  archiveType: ["aggregator", "national-archive"],
  contentType: ["peer-reviewed", "textual", "primary-source"],
  color: { bg: "bg-orange-700", text: "text-orange-50" },
  needsKey: true, keyName: "ndliKey", keyLabel: "NDLI API key",
  keyHelp: "Free at ndl.iitkgp.ac.in — register, then copy key from My Account.",
  capability: {
    protocol: "rest-json", fulltext: false, pagination: "offset",
    totalCount: true, maxWindow: null, auth: "key",
    // Descriptions are often short catalogue text rather than full scholarly abstracts.
    rankFields: { abstract: "sparse", subjects: "full", citedBy: false },
  },
  search: async (query, settings, opts = {}) => {
    if (!settings.ndliKey) throw new Error("NDLI needs a free API key. Add yours in settings (⚙).");
    const offset = opts.offset || 0;
    const size = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const url =
      `https://ndl.iitkgp.ac.in/rest-api/search` +
      `?query=${encodeURIComponent(query)}` +
      `&size=${size}` +
      `&start=${offset}` +
      `&sort-by=score` +
      `&sort-order=desc` +
      `&api-key=${encodeURIComponent(settings.ndliKey)}`;
    const r = await proxiedFetch(url, { headers: { Accept: "application/json" } }, { adapterId: "NDLI" });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new Error("NDLI API key invalid or unauthorized.");
      throw new Error(`NDLI ${r.status}`);
    }
    const data = await r.json();
    // Response shape: { status, message: { total, records[] } }
    const msg = data.message || {};
    const total = msg.total ?? 0;
    const records = msg.records || [];
    const results = records.map((rec, i) => {
      // Defensive accessors: any DC field may arrive as string or array.
      const str = (f) =>
        Array.isArray(rec[f]) ? (rec[f][0] || "") : String(rec[f] || "");
      const all = (f) =>
        Array.isArray(rec[f])
          ? rec[f].filter(Boolean)
          : rec[f] ? [String(rec[f])] : [];
      // creator: may be a single string, comma/semicolon-delimited, or an array.
      const authors = all("creator")
        .flatMap((s) => s.split(/;+/).map((a) => a.trim()))
        .filter(Boolean);
      // identifier: NDLI item URL; extract DOI pattern if embedded.
      const identifier = str("identifier");
      const doi = (identifier.match(/\b10\.\d{4,}\/\S+/)?.[0] || "").trim();
      // title: try plain "title" first, fall back to "title.eng" for bilingual records.
      const title = str("title") || str("title.eng") || "Untitled";
      return {
        id: `ndli-${rec.id || `${offset}-${i}`}`,
        source: "NDLI",
        title,
        authors,
        year: String(str("date") || "").match(/\d{4}/)?.[0] || "",
        journal: str("relation") || str("source") || "",
        publisher: str("publisher") || "",
        volume: "", issue: "", pages: "",
        doi,
        url: doi ? `https://doi.org/${doi}` : identifier,
        abstract: stripHtml(str("description") || str("abstract") || ""),
        isOA: true,
        type: str("format") || str("type") || "article",
        subjects: all("subject").slice(0, 8),
        language: str("language") || "",
      };
    });
    return { results, hasMore: offset + results.length < total };
  },
};
