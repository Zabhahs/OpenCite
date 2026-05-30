import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { proxiedFetch } from "../_shared/proxy.js";
import { sruTotal, sruRecords, unimarcOne, unimarcAll } from "../_shared/xmlUtils.js";

export const BNF_API_ADAPTER = {
  id: "BNF_API", name: "BnF Catalogue",
  tagline: "Bibliothèque nationale de France · catalog metadata · SRU",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe", "north-africa", "mena"],
  archiveType: ["national-archive", "library"],
  contentType: ["textual", "manuscript", "primary-source"],
  color: { bg: "bg-rose-800", text: "text-rose-50" }, needsKey: false,
  capability: {
    // SRU/UNIMARC catalog. No abstract field in UNIMARC; subjects from 600/606/607.
    protocol: "sru", fulltext: false, pagination: "offset", totalCount: true, maxWindow: null, auth: "none",
    rankFields: { abstract: "none", subjects: "full", citedBy: false },
    serverSafe: true,
    corpusSize: 15000000, // ~15M catalogue records (conservative); catalogue.bnf.fr
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const startRecord = offset + 1;
    const sruUrl = `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${encodeURIComponent(`bib.anywhere="${query}"`)}&maximumRecords=${pageSize}&startRecord=${startRecord}&recordSchema=unimarcxchange`;
    let r;
    try {
      r = await fetch(sruUrl, { headers: { Accept: 'application/xml, text/xml' } });
    } catch {
      r = await proxiedFetch(sruUrl, {}, { adapterId: "BNF_API" });
    }
    if (!r.ok) throw new Error(`BnF SRU ${r.status}`);
    const xml = await r.text();
    const total = sruTotal(xml);
    const records = sruRecords(xml);
    const results = records.map((rec, i) => {
      const title     = unimarcOne(rec, '200', 'a') || 'Untitled';
      const authorFam = unimarcOne(rec, '700', 'a');
      const authorGiv = unimarcOne(rec, '700', 'b');
      const corpAuth  = unimarcOne(rec, '710', 'a');
      const authorStr = authorFam ? [authorFam, authorGiv].filter(Boolean).join(', ') : corpAuth;
      const date      = unimarcOne(rec, '210', 'd');
      const language  = unimarcOne(rec, '101', 'a');
      const identifier= unimarcOne(rec, '003');
      const subjects  = [
        ...unimarcAll(rec, '600', 'a'),
        ...unimarcAll(rec, '606', 'a'),
        ...unimarcAll(rec, '607', 'a'),
      ].filter(Boolean);
      return {
        id: `bnf-${offset}-${i}`,
        source: 'BNF_API',
        title,
        authors: authorStr ? [authorStr] : [],
        year: String(date).match(/\d{4}/)?.[0] || '',
        journal: '', publisher: 'Bibliothèque nationale de France',
        volume: '', issue: '', pages: '', doi: '',
        url: identifier.startsWith('http') ? identifier : '',
        abstract: '',
        isOA: true,
        type: 'primary-source',
        subjects,
        language,
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
