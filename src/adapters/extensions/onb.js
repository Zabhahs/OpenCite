import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { proxiedFetch } from "../_shared/proxy.js";
import { dcOne, dcAll, sruTotal, sruRecords } from "../_shared/xmlUtils.js";

export const ONB_ADAPTER = {
  id: "ONB", name: "ONB / ANNO",
  tagline: "Austrian National Library · historic newspapers & books via SRU",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe"],
  archiveType: ["national-archive", "library", "newspaper-archive"],
  contentType: ["textual", "manuscript", "primary-source"],
  color: { bg: "bg-red-900", text: "text-red-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const startRecord = offset + 1;
    const sruUrl = `https://search.onb.ac.at/SRU?operation=searchRetrieve&version=1.2&query=${encodeURIComponent(`dc.title="${query}" or dc.subject="${query}"`)}&maximumRecords=${pageSize}&startRecord=${startRecord}&recordSchema=oai_dc`;
    let r;
    try {
      r = await fetch(sruUrl, { headers: { Accept: "application/xml, text/xml" } });
    } catch {
      r = await proxiedFetch(sruUrl);
    }
    if (!r.ok) throw new Error(`ONB SRU ${r.status}`);
    const xml = await r.text();
    const total = sruTotal(xml);
    const records = sruRecords(xml);
    const results = records.map((rec, i) => {
      const identifier = dcOne(rec, 'identifier');
      return {
        id: `onb-${offset}-${i}`,
        source: 'ONB',
        title: dcOne(rec, 'title') || 'Untitled',
        authors: dcAll(rec, 'creator'),
        year: dcOne(rec, 'date').match(/\d{4}/)?.[0] || '',
        journal: '', publisher: 'Austrian National Library (ONB)',
        volume: '', issue: '', pages: '', doi: '',
        url: identifier.startsWith('http') ? identifier : '',
        abstract: dcOne(rec, 'description'),
        isOA: true,
        type: 'primary-source',
        subjects: dcAll(rec, 'subject'),
        language: dcOne(rec, 'language'),
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
