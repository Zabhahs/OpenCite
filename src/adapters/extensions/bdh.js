import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { proxiedFetch } from "../_shared/proxy.js";

export const BDH_ADAPTER = {
  id: "BDH", name: "BDH / BNE",
  tagline: "Biblioteca Digital Hispánica · Spanish National Library digitized collections",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe", "latin-america"],
  archiveType: ["national-archive", "library"],
  contentType: ["textual", "manuscript", "visual", "primary-source"],
  color: { bg: "bg-yellow-900", text: "text-yellow-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const url = `https://datos.bne.es/api/records?q=${encodeURIComponent(query)}&start=${offset}&rows=${pageSize}&format=json`;
    let r;
    try {
      r = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch {
      r = await proxiedFetch(url, {}, { adapterId: "BDH" });
    }
    if (!r.ok) throw new Error(`BDH/BNE ${r.status}`);
    const data = await r.json();
    const records = data.records || data.results || data.items || [];
    const total = data.total || data.totalResults || records.length;
    const results = records.map((rec, i) => {
      const title      = rec.title || rec['dc:title'] || rec.prefLabel || 'Untitled';
      const creators   = [].concat(rec.creator || rec['dc:creator'] || []).filter(Boolean);
      const date       = rec.date || rec['dc:date'] || '';
      const desc       = rec.description || rec['dc:description'] || '';
      const subjects   = [].concat(rec.subject || rec['dc:subject'] || []).filter(Boolean);
      const language   = rec.language || rec['dc:language'] || 'es';
      const identifier = rec.uri || rec.url || rec['dc:identifier'] || '';
      const itemUrl    = identifier.startsWith('http') ? identifier : `https://bdh.bne.es/bnesearch/detalle/${rec.id || ''}`;
      return {
        id: `bdh-${rec.id || `${offset}-${i}`}`,
        source: 'BDH',
        title: String(title),
        authors: creators.map(String),
        year: String(date).match(/\d{4}/)?.[0] || '',
        journal: '', publisher: 'Biblioteca Nacional de España',
        volume: '', issue: '', pages: '', doi: '',
        url: itemUrl,
        abstract: String(desc),
        isOA: true,
        type: 'primary-source',
        subjects: subjects.map(String),
        language: String(language),
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
