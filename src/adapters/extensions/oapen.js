import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { proxiedFetch } from "../_shared/proxy.js";

// OAPEN DSpace REST. Peer-reviewed open-access scholarly BOOKS (the DOAB corpus is
// built on OAPEN; the doabooks.org directory is Cloudflare-gated, library.oapen.org is not).
// /rest/search returns a bare array with no total → paginate by offset, infer hasMore from a full page.
export const OAPEN_ADAPTER = {
  id: "OAPEN", name: "OAPEN",
  tagline: "Open-access peer-reviewed scholarly books · humanities & social sciences",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global", "europe"],
  archiveType: ["scholarly-index", "research-repository"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-indigo-800", text: "text-indigo-50" }, needsKey: false,
  capability: {
    protocol: "rest-json", fulltext: false, pagination: "offset", totalCount: false, maxWindow: null, auth: "none",
    rankFields: { abstract: "full", subjects: "full", citedBy: false },
    serverSafe: true,
    corpusSize: 30000, // ~30K OA books; library.oapen.org
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const url = `https://library.oapen.org/rest/search?query=${encodeURIComponent(query)}&expand=metadata&limit=${pageSize}&offset=${offset}`;
    const r = await proxiedFetch(url, { headers: { Accept: "application/json" } }, { adapterId: "OAPEN" });
    if (!r.ok) throw new Error(`OAPEN ${r.status}`);
    const items = await r.json();
    const arr = Array.isArray(items) ? items : [];
    const results = arr.map((item, i) => {
      const md = item.metadata || [];
      const all = (key) => md.filter((m) => m.key === key).map((m) => m.value).filter(Boolean);
      const one = (key) => all(key)[0] || "";
      const subjects = [...all("dc.subject.classification"), ...all("dc.subject.other")].slice(0, 8);
      const doi = one("oapen.identifier.doi").replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
      const handle = item.handle ? `https://library.oapen.org/handle/${item.handle}` : "";
      return {
        id: `oapen-${item.uuid || `${offset}-${i}`}`,
        source: "OAPEN",
        title: one("dc.title") || item.name || "Untitled",
        authors: all("dc.contributor.author"),
        year: one("dc.date.issued").match(/\d{4}/)?.[0] || "",
        journal: "",
        publisher: one("publisher.name") || one("oapen.relation.isPublishedBy"),
        volume: "", issue: "", pages: one("oapen.pages"),
        doi,
        url: doi ? `https://doi.org/${doi}` : (one("dc.identifier.uri") || handle),
        abstract: stripHtml(one("dc.description.abstract")),
        isOA: true,
        type: one("dc.type") || "book",
        subjects,
        language: one("dc.language"),
      };
    });
    return { results, hasMore: results.length === pageSize };
  }
};
