import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { proxiedFetch } from "../_shared/proxy.js";

export const DELPHER_ADAPTER = {
  id: "DELPHER", name: "KB / Delpher",
  tagline: "Dutch National Library · newspapers, books & magazines",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe"],
  archiveType: ["national-archive", "library", "newspaper-archive"],
  contentType: ["textual", "primary-source", "ephemera"],
  color: { bg: "bg-orange-950", text: "text-orange-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const sruUrl = `https://www.delpher.nl/nl/platform/api/search?query=${encodeURIComponent(query)}&page=${page}&maxperpage=${pageSize}&output=json`;
    let r;
    try {
      r = await fetch(sruUrl, { headers: { Accept: 'application/json' } });
    } catch {
      r = await proxiedFetch(sruUrl, {}, { adapterId: "DELPHER" });
    }
    if (!r.ok) throw new Error(`Delpher ${r.status}`);
    const data = await r.json();
    const items = data.results || data.items || [];
    const total = data.count || data.total || items.length;
    const results = items.map((it, i) => {
      const creators = [].concat(it.creator || it.author || []).filter(Boolean);
      const date = it.date || it.publication_date || '';
      const subjects = [].concat(it.subject || it['dcterms:subject'] || []).filter(Boolean).map(String);
      const rawType = it.type || it['dc:type'] || 'primary-source';
      return {
        id: `delpher-${it.identifier || `${offset}-${i}`}`,
        source: 'DELPHER',
        title: stripHtml(String(it.title || it.heading || 'Untitled')),
        authors: creators.map(String),
        year: String(date).match(/\d{4}/)?.[0] || '',
        journal: it.paper_title || it.publication || '',
        publisher: 'Koninklijke Bibliotheek',
        volume: '', issue: '', pages: '', doi: '',
        url: it.url || it.link || (it.identifier ? `https://resolver.kb.nl/resolve?urn=${it.identifier}` : ''),
        abstract: stripHtml(it.description || it.snippet || ''),
        isOA: true,
        type: rawType,
        subjects,
        language: it.language || 'nl',
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
