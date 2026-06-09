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
  capability: {
    protocol: "sru", fulltext: false, pagination: "offset", totalCount: true, maxWindow: null, auth: "none",
    rankFields: { abstract: "sparse", subjects: "full", citedBy: false },
    serverSafe: true,
    corpusSize: 2000000, // ~2M records (conservative); Austrian National Library / ANNO catalogue
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const startRecord = offset + 1;
    const sruUrl = `https://obv-at-oenb.alma.exlibrisgroup.com/view/sru/43ACC_ONB?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(`alma.all_for_ui="${query}"`)}&maximumRecords=${pageSize}&startRecord=${startRecord}&recordSchema=dc`;
    // v0.38 (T7, F-102): browser direct fetch throws a CORS error before the proxy fallback
    // (wasted RTT + red DevTools error every call). Server hits the origin directly; browser
    // always proxies. No SSR today, so the `window` guard is correct for this architecture.
    let r;
    if (typeof window === 'undefined') {
      r = await fetch(sruUrl, { headers: { Accept: "application/xml, text/xml" } });
    } else {
      r = await proxiedFetch(sruUrl, {}, { adapterId: "ONB" });
    }
    if (!r.ok) throw new Error(`ONB SRU ${r.status}`);
    const xml = await r.text();
    const total = sruTotal(xml);
    const records = sruRecords(xml);
    const results = records.map((rec, i) => {
      const identifiers = dcAll(rec, 'identifier');
      const doi = identifiers.find(id => id.startsWith('https://doi.org/')) || '';
      const url = identifiers.find(id => id.startsWith('http') && !id.includes('doi.org')) || '';
      const rawContributors = dcAll(rec, 'contributor');
      const authors = rawContributors.map(c => c.replace(/,?\s+(author|contributor|editor|compiler|translator|illustrator)\..*$/i, '').trim()).filter(Boolean);
      return {
        id: `onb-${offset}-${i}`,
        source: 'ONB',
        title: dcOne(rec, 'title') || 'Untitled',
        authors,
        year: dcOne(rec, 'date').match(/\d{4}/)?.[0] || '',
        journal: '', publisher: 'Austrian National Library (ONB)',
        volume: '', issue: '', pages: '',
        doi: doi.replace('https://doi.org/', ''),
        url: url || (doi || ''),
        abstract: dcOne(rec, 'description'),
        isOA: false,
        type: 'book',
        subjects: dcAll(rec, 'subject'),
        language: dcOne(rec, 'language'),
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
