import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";

export const LC_DATASETS_ADAPTER = {
  id: "LC_DATASETS", name: "Library of Congress",
  tagline: "loc.gov · digitized collections, newspapers & datasets",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["north-america", "global"],
  archiveType: ["national-archive", "library", "newspaper-archive"],
  contentType: ["textual", "visual", "primary-source", "ephemera"],
  color: { bg: "bg-sky-900", text: "text-sky-50" }, needsKey: false,
  capability: {
    // loc.gov fo=json. LoC caps deep paging at 100k (429/CAPTCHA risk near the ceiling).
    protocol: "rest-json", fulltext: false, pagination: "page", totalCount: true, maxWindow: 100000, auth: "none",
    rankFields: { abstract: "sparse", subjects: "full", citedBy: false },
    serverSafe: true,
    corpusSize: 5000000, // ~5M digitized items (conservative); loc.gov
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const url = `https://loc.gov/search/?q=${encodeURIComponent(query)}&fo=json&c=${pageSize}&sp=${page}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Library of Congress ${r.status}`);
    const data = await r.json();
    const items = data.results || [];
    const total = data.pagination?.total || items.length;
    const results = items.map((it, i) => {
      const creator  = [].concat(it.creator || []).filter(Boolean);
      const subjects = [].concat(it.subject || [])
        .map(s => (typeof s === 'string' ? s : s.subject || '')).filter(Boolean);
      const itemUrl  = it.url || it.id || '';
      return {
        id: `lc-${it.id || `${offset}-${i}`}`,
        source: 'LC_DATASETS',
        title: stripHtml(String(it.title || 'Untitled')),
        authors: creator.map(String),
        year: String(it.date || '').match(/\d{4}/)?.[0] || '',
        journal: it.partof?.[0] || '', publisher: 'Library of Congress',
        volume: '', issue: '', pages: '', doi: '',
        url: itemUrl.startsWith('http') ? itemUrl : `https://loc.gov${itemUrl}`,
        abstract: stripHtml(it.description?.[0] || it.notes?.[0] || ''),
        isOA: true,
        type: it.type?.[0] === 'online text' ? 'textual' : 'primary-source',
        subjects,
        language: it.language?.[0] || '',
        previewImage: it.image_url?.[0] || '',
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
