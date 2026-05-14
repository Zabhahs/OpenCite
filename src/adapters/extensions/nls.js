import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { proxiedFetch } from "../_shared/proxy.js";

export const NLS_ADAPTER = {
  id: "NLS", name: "NLS Data Foundry",
  tagline: "National Library of Scotland · digitized newspapers, maps & datasets",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe"],
  archiveType: ["national-archive", "library", "newspaper-archive"],
  contentType: ["textual", "visual", "primary-source"],
  color: { bg: "bg-blue-950", text: "text-blue-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const url = `https://data.nls.uk/api/search/?q=${encodeURIComponent(query)}&page=${page}&per_page=${pageSize}`;
    let r;
    try {
      r = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch {
      r = await proxiedFetch(url);
    }
    if (!r.ok) throw new Error(`NLS Data Foundry ${r.status}`);
    const data = await r.json();
    const items = data.results || data.items || data.data || [];
    const total = data.total || data.totalResults || items.length;
    const results = items.map((it, i) => {
      const creators = [].concat(it.creator || it.author || []).filter(Boolean);
      const itemUrl  = it.url || it.identifier || '';
      // subjects: NLS exposes subject, topic, or tag arrays at collection level
      const subjects = [
        ...[].concat(it.subject || []),
        ...[].concat(it.topic || []),
        ...[].concat(it.tags || []),
      ].filter(Boolean).map(String);
      // type: NLS uses format or type to distinguish newspapers, maps, photographs, etc.
      const rawType = it.type || it.format || it.mediaType || 'primary-source';
      return {
        id: `nls-${it.id || `${offset}-${i}`}`,
        source: 'NLS',
        title: stripHtml(String(it.title || it.name || 'Untitled')),
        authors: creators.map(String),
        year: String(it.date || it.year || it.created || '').match(/\d{4}/)?.[0] || '',
        journal: it.collection || it.series || '',
        publisher: 'National Library of Scotland',
        volume: '', issue: '', pages: '', doi: '',
        url: itemUrl.startsWith('http') ? itemUrl : '',
        abstract: stripHtml(String(it.description || it.abstract || '')),
        isOA: true,
        type: rawType,
        subjects,
        language: it.language || 'en',
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
