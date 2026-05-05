import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";
import { proxiedFetch } from "../_shared/proxy.js";

/* === 1. EUROPEANA === */
export const EUROPEANA_ADAPTER = {
  id: "EUROPEANA", name: "Europeana",
  tagline: "Cultural heritage · museums · primary sources",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe"], archiveType: ["aggregator", "museum", "library"],
  contentType: ["primary-source", "visual", "manuscript", "ephemera"],
  color: { bg: "bg-emerald-900", text: "text-emerald-50" },
  needsKey: true, keyName: "europeanaKey", keyLabel: "Europeana API key",
  keyHelp: "Free, instant. Register at api.europeana.eu — paste the key here.",
  search: async (query, settings, opts = {}) => {
    if (!settings.europeanaKey) throw new Error("Europeana needs a free API key. Open settings (⚙) to add yours.");
    const offset = opts.offset || 0;
    const rows = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const start = offset + 1;
    const url = `https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(settings.europeanaKey)}&query=${encodeURIComponent(query)}&rows=${rows}&start=${start}&profile=rich`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Europeana ${r.status}`);
    const data = await r.json();
    if (data.success === false) throw new Error(data.error || "Europeana request rejected — check your API key.");
    const results = (data.items || []).map((it, i) => {
      const title = Array.isArray(it.title) ? it.title[0] : (it.title || "Untitled");
      const creators = it.dcCreator || it.edmAgentLabel || [];
      const year = (it.year && it.year[0]) || (it.edmTimespanLabel && it.edmTimespanLabel[0]?.def) || "";
      return {
        id: `eu-${it.id || `${offset}-${i}`}`, source: "EUROPEANA",
        title: stripHtml(title),
        authors: Array.isArray(creators) ? creators.filter(Boolean) : [],
        year: String(year || "").slice(0, 4), journal: "",
        publisher: (it.dataProvider && it.dataProvider[0]) || "",
        volume: "", issue: "", pages: "", doi: "",
        url: (it.edmIsShownAt && it.edmIsShownAt[0]) || it.guid || "",
        abstract: stripHtml((it.dcDescription && it.dcDescription[0]) || ""),
        isOA: true, type: "primary-source",
        previewImage: (it.edmPreview && it.edmPreview[0]) || ""
      };
    });
    return { results, hasMore: offset + results.length < (data.totalResults || 0) };
  }
};

/* === 2. THE MET === */
export const MET_ADAPTER = {
  id: "MET", name: "The Met",
  tagline: "Metropolitan Museum of Art · 470,000+ artworks",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global", "north-america"], archiveType: ["museum"], contentType: ["visual", "primary-source"],
  color: { bg: "bg-red-800", text: "text-red-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(query)}&hasImages=true`);
    if (!r.ok) throw new Error(`Met ${r.status}`);
    const data = await r.json();
    const allIds = data.objectIDs || [];
    const slice = allIds.slice(offset, offset + pageSize);
    const items = await Promise.all(slice.map(async id => {
      try {
        const ir = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
        return ir.ok ? await ir.json() : null;
      } catch { return null; }
    }));
    const results = items.filter(Boolean).map(it => ({
      id: `met-${it.objectID}`, source: "MET",
      title: it.title || "Untitled",
      authors: it.artistDisplayName ? [it.artistDisplayName] : [],
      year: it.objectDate || (it.objectBeginDate ? String(it.objectBeginDate) : ""),
      journal: it.department || "", publisher: "The Metropolitan Museum of Art",
      volume: "", issue: "", pages: "", doi: "",
      url: it.objectURL || "",
      abstract: [it.medium, it.dimensions, it.creditLine].filter(Boolean).join(". "),
      isOA: it.isPublicDomain === true, type: "primary-source",
      previewImage: it.primaryImageSmall || it.primaryImage || ""
    }));
    return { results, hasMore: offset + slice.length < allIds.length };
  }
};

/* === 3. SMITHSONIAN === */
export const SMITHSONIAN_ADAPTER = {
  id: "SMITHSONIAN", name: "Smithsonian",
  tagline: "11M+ records across 19 museums",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global", "north-america"], archiveType: ["museum", "research-repository"],
  contentType: ["visual", "primary-source", "3d"],
  color: { bg: "bg-blue-900", text: "text-blue-50" },
  needsKey: true, keyName: "smithsonianKey", keyLabel: "Smithsonian API key",
  keyHelp: "Free key from api.data.gov/signup — instant. Used for Smithsonian Open Access.",
  search: async (query, settings, opts = {}) => {
    if (!settings.smithsonianKey) throw new Error("Smithsonian needs an api.data.gov key. Add yours in settings (⚙).");
    const offset = opts.offset || 0;
    const rows = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const url = `https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(query)}&start=${offset}&rows=${rows}&api_key=${encodeURIComponent(settings.smithsonianKey)}`;
    const r = await fetch(url);
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new Error("Smithsonian API key invalid or unauthorized.");
      throw new Error(`Smithsonian ${r.status}`);
    }
    const data = await r.json();
    const rowsData = data.response?.rows || [];
    const total = data.response?.rowCount || 0;
    const results = rowsData.map((row, i) => {
      const c = row.content || {};
      const desc = c.descriptiveNonRepeating || {};
      const idx = c.indexedStructured || {};
      return {
        id: `si-${row.id || `${offset}-${i}`}`, source: "SMITHSONIAN",
        title: desc.title?.content || row.title || "Untitled",
        authors: (Array.isArray(idx.name) ? idx.name : []).filter(Boolean),
        year: String((Array.isArray(idx.date) ? idx.date[0] : "") || "").slice(0, 4),
        journal: "", publisher: desc.unit_code || "Smithsonian",
        volume: "", issue: "", pages: "", doi: "",
        url: desc.record_link || "",
        abstract: c.freetext?.notes?.[0]?.content || "",
        isOA: true, type: "primary-source",
        previewImage: desc.online_media?.media?.[0]?.thumbnail || ""
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};

/* === 4. DPLA (Updated with Proxy) === */
export const DPLA_ADAPTER = {
  id: "DPLA", name: "DPLA",
  tagline: "Digital Public Library of America · 50M+ items",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["north-america"], archiveType: ["aggregator", "library"],
  contentType: ["textual", "visual", "primary-source", "manuscript"],
  color: { bg: "bg-indigo-900", text: "text-indigo-50" },
  needsKey: true, keyName: "dplaKey", keyLabel: "DPLA API key",
  keyHelp: "Free 32-char key. Email pro.dp.la to request — typically same-day.",
  search: async (query, settings, opts = {}) => {
    if (!settings.dplaKey) throw new Error("DPLA needs a free API key. Add yours in settings (⚙).");
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    // Updated to proxiedFetch to avoid CORS/Regional blocks
    const r = await proxiedFetch(`https://api.dp.la/v2/items?q=${encodeURIComponent(query)}&page=${page}&page_size=${pageSize}&api_key=${encodeURIComponent(settings.dplaKey)}`);
    if (!r.ok) throw new Error(`DPLA ${r.status}`);
    const data = await r.json();
    const results = (data.docs || []).map((d, i) => {
      const src = d.sourceResource || {};
      const title = Array.isArray(src.title) ? src.title[0] : (src.title || "Untitled");
      const creators = Array.isArray(src.creator) ? src.creator : (src.creator ? [src.creator] : []);
      const date = src.date?.displayDate || (Array.isArray(src.date) ? src.date[0]?.displayDate : "") || "";
      const desc = Array.isArray(src.description) ? src.description[0] : (src.description || "");
      return {
        id: `dpla-${d.id || `${offset}-${i}`}`, source: "DPLA", title,
        authors: creators, year: String(date).match(/\d{4}/)?.[0] || "",
        journal: "", publisher: d.provider?.name || "",
        volume: "", issue: "", pages: "", doi: "",
        url: d.isShownAt || "", abstract: stripHtml(desc),
        isOA: true, type: "primary-source", previewImage: d.object || ""
      };
    });
    return { results, hasMore: offset + results.length < (data.count || 0) };
  }
};

/* === 5. RIJKSMUSEUM === */
export const RIJKSMUSEUM_ADAPTER = {
  id: "RIJKS", name: "Rijksmuseum",
  tagline: "Dutch Golden Age · 700,000+ objects",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe"], archiveType: ["museum"], contentType: ["visual", "primary-source"],
  color: { bg: "bg-orange-900", text: "text-orange-50" },
  needsKey: true, keyName: "rijksKey", keyLabel: "Rijksmuseum API key",
  keyHelp: "Free, instant. Register a Rijksstudio account at rijksmuseum.nl — find key in advanced settings.",
  search: async (query, settings, opts = {}) => {
    if (!settings.rijksKey) throw new Error("Rijksmuseum needs a free API key. Add yours in settings (⚙).");
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const r = await fetch(`https://www.rijksmuseum.nl/api/en/collection?key=${encodeURIComponent(settings.rijksKey)}&q=${encodeURIComponent(query)}&p=${page}&ps=${pageSize}&imgonly=true`);
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new Error("Rijksmuseum API key invalid.");
      throw new Error(`Rijksmuseum ${r.status}`);
    }
    const data = await r.json();
    const results = (data.artObjects || []).map((a, i) => ({
      id: `rijks-${a.objectNumber || `${offset}-${i}`}`, source: "RIJKS",
      title: a.title || "Untitled",
      authors: a.principalOrFirstMaker ? [a.principalOrFirstMaker] : [],
      year: a.longTitle?.match(/\b(1[0-9]{3}|20[0-9]{2})\b/)?.[0] || "",
      journal: "", publisher: "Rijksmuseum",
      volume: "", issue: "", pages: "", doi: "",
      url: a.links?.web || `https://www.rijksmuseum.nl/en/collection/${a.objectNumber}`,
      abstract: a.longTitle || "", isOA: true, type: "primary-source",
      previewImage: a.webImage?.url || a.headerImage?.url || ""
    }));
    return { results, hasMore: offset + results.length < (data.count || 0) };
  }
};

/* === 6. INTERNET ARCHIVE === */
export const INTERNET_ARCHIVE_ADAPTER = {
  id: "IA", name: "Internet Archive",
  tagline: "42M+ texts · scholarly, historical, ephemeral",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["aggregator", "library", "audiovisual-archive"],
  contentType: ["textual", "audio", "primary-source", "ephemera"],
  color: { bg: "bg-stone-700", text: "text-stone-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const fields = "identifier,title,creator,date,description,mediatype,collection";
    const params = `q=${encodeURIComponent(query + " AND mediatype:texts")}&fl[]=${fields.split(",").join("&fl[]=")}&rows=${pageSize}&page=${page}&output=json`;
    const r = await fetch(`https://archive.org/advancedsearch.php?${params}`);
    if (!r.ok) throw new Error(`Internet Archive ${r.status}`);
    const data = await r.json();
    const docs = data.response?.docs || [];
    const results = docs.map((d, i) => {
      const creator = Array.isArray(d.creator) ? d.creator : (d.creator ? [d.creator] : []);
      const desc = Array.isArray(d.description) ? d.description[0] : (d.description || "");
      return {
        id: `ia-${d.identifier || `${offset}-${i}`}`, source: "IA",
        title: Array.isArray(d.title) ? d.title[0] : (d.title || "Untitled"),
        authors: creator, year: String(d.date || "").match(/\d{4}/)?.[0] || "",
        journal: "", publisher: "Internet Archive",
        volume: "", issue: "", pages: "", doi: "",
        url: d.identifier ? `https://archive.org/details/${d.identifier}` : "",
        abstract: stripHtml(desc), isOA: true, type: "textual",
        previewImage: d.identifier ? `https://archive.org/services/img/${d.identifier}` : ""
      };
    });
    return { results, hasMore: offset + results.length < (data.response?.numFound || 0) };
  }
};

/* === 7. BDPI (Updated with Proxy) === */
export const BDPI_ADAPTER = {
  id: "BDPI", name: "BDPI",
  tagline: "Biblioteca Digital del Patrimonio Iberoamericano · 16 national libraries",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["latin-america", "europe"], archiveType: ["aggregator", "national-archive", "library"],
  contentType: ["textual", "manuscript", "visual", "primary-source"],
  color: { bg: "bg-yellow-800", text: "text-yellow-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
  const offset = opts.offset || 0;
  const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;

  const r = await fetch(`/api/search/bdpi?q=${encodeURIComponent(query)}&start=${offset}&rows=${pageSize}`);

  if (!r.ok) throw new Error(`BDPI ${r.status}`);

  const data = await r.json();

  return {
    results: data.results || [],
    hasMore: offset + (data.results?.length || 0) < (data.total || 0)
  };
}
  }
};

/* === 8. GALLICA (Updated with Proxy) === */
export const GALLICA_ADAPTER = {
  id: "GALLICA", name: "BnF Gallica",
  tagline: "Bibliothèque nationale de France · 9M+ digitized items",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe", "north-africa", "mena"],
  archiveType: ["national-archive", "library", "manuscript-collection"],
  contentType: ["manuscript", "textual", "visual", "primary-source"],
  color: { bg: "bg-rose-900", text: "text-rose-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
  const offset = opts.offset || 0;
  const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;

  const r = await fetch(`/api/search/gallica?q=${encodeURIComponent(query)}&start=${offset}&rows=${pageSize}`);

  if (!r.ok) throw new Error(`Gallica ${r.status}`);

  const data = await r.json();

  return {
    results: data.results || [],
    hasMore: offset + (data.results?.length || 0) < (data.total || 0)
  };
}
    }
};

/* === 9. THAQALAYN === */
export const THAQALAYN_ADAPTER = {
  id: "THAQALAYN", name: "Thaqalayn",
  tagline: "Comprehensive Shi'i hadith library · keyless API",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["mena", "south-asia"], archiveType: ["research-repository"], contentType: ["textual"],
  color: { bg: "bg-emerald-800", text: "text-emerald-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const r = await fetch(`https://www.thaqalayn-api.net/api/v2/query?q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Thaqalayn ${r.status}`);
    const data = await r.json();
    const all = Array.isArray(data) ? data : (data.hadiths || data.results || []);
    const slice = all.slice(offset, offset + pageSize);
    const results = slice.map((h, i) => {
      const englishText = h.english || h.englishText || h.text_en || "";
      const arabicText = h.arabic || h.arabicText || h.text_ar || "";
      const book = h.bookName || h.book || "";
      const hadithNumber = h.hadithNumber || h.id || "";
      return {
        id: `thaq-${h._id || h.id || `${offset}-${i}`}`, source: "THAQALAYN",
        title: book && hadithNumber ? `${book}, hadith ${hadithNumber}` : (book || "Hadith"),
        authors: [], year: "", journal: h.chapterName || h.chapter || "",
        publisher: "Thaqalayn", volume: "", issue: "",
        pages: hadithNumber ? String(hadithNumber) : "", doi: "",
        url: "https://thaqalayn.net/",
        abstract: stripHtml(englishText) || stripHtml(arabicText),
        isOA: true, type: "textual"
      };
    });
    return { results, hasMore: offset + slice.length < all.length };
  }
};

/* === 10. NCBI === */
export const NCBI_ADAPTER = {
  id: "NCBI", name: "NCBI Entrez",
  tagline: "Biomedical & life sciences · PubMed via E-utilities",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["scholarly-index", "research-repository"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-cyan-900", text: "text-cyan-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const r1 = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retstart=${offset}&retmax=${pageSize}`);
    if (!r1.ok) throw new Error(`NCBI esearch ${r1.status}`);
    const searchData = await r1.json();
    const ids = searchData.esearchresult?.idlist || [];
    const total = parseInt(searchData.esearchresult?.count || "0", 10);
    if (ids.length === 0) return { results: [], hasMore: false };
    const r2 = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`);
    if (!r2.ok) throw new Error(`NCBI esummary ${r2.status}`);
    const summaryData = await r2.json();
    const summaries = summaryData.result || {};
    const results = ids.map(id => {
      const it = summaries[id];
      if (!it) return null;
      const doi = (it.elocationid || "").replace(/^doi:\s*/i, "") || (it.articleids || []).find(a => a.idtype === "doi")?.value || "";
      return {
        id: `ncbi-${id}`, source: "NCBI",
        title: it.title || "Untitled",
        authors: (it.authors || []).map(a => a.name).filter(Boolean),
        year: String(it.pubdate || "").match(/\d{4}/)?.[0] || "",
        journal: it.fulljournalname || it.source || "", publisher: "",
        volume: it.volume || "", issue: it.issue || "", pages: it.pages || "",
        doi, url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        abstract: "", isOA: false, type: "article"
      };
    }).filter(Boolean);
    return { results, hasMore: offset + results.length < total };
  }
};

/* === 11. OPEN CONTEXT === */
export const OPENCONTEXT_ADAPTER = {
  id: "OPENCONTEXT", name: "Open Context",
  tagline: "Archaeological datasets · keyless JSON-LD",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["archaeological-database"],
  contentType: ["archaeological-data", "primary-source"],
  color: { bg: "bg-stone-600", text: "text-stone-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
  const offset = opts.offset || 0;
  const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;

  const r = await fetch(`/api/search/opencontext?q=${encodeURIComponent(query)}&start=${offset}&rows=${pageSize}`);

  if (!r.ok) throw new Error(`Open Context ${r.status}`);

  const data = await r.json();

  return {
    results: data.results || [],
    hasMore: offset + (data.results?.length || 0) < (data.total || 0)
  };
}
    }
};

/* === 12. NORTHWESTERN === */
export const NORTHWESTERN_ADAPTER = {
  id: "NORTHWESTERN", name: "Northwestern Digital",
  tagline: "Herskovits Library · Hausa/Fulani Ajami, West African Arabic-script MSS",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["west-africa", "sahel", "global"],
  archiveType: ["library", "manuscript-collection"], contentType: ["manuscript", "primary-source", "visual"],
  color: { bg: "bg-purple-900", text: "text-purple-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const body = { query: { query_string: { query, default_operator: "AND" } }, size: pageSize, from: offset };
    const nuUrl = "https://api.dc.library.northwestern.edu/api/v2/search";
    let r;
    try {
      r = await fetch(nuUrl, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    } catch {
      r = await proxiedFetch(nuUrl, { method: "POST", body: JSON.stringify(body) });
    }
    if (!r.ok) throw new Error(`Northwestern ${r.status}`);
    const data = await r.json();
    const docs = data.data || [];
    const total = data.info?.total || data.pagination?.total_results || docs.length;
    const results = docs.map((d, i) => ({
      id: `nu-${d.id || `${offset}-${i}`}`, source: "NORTHWESTERN",
      title: d.title || "Untitled",
      authors: (d.creator || []).map(c => c.label || c).filter(Boolean),
      year: String(d.date_created?.[0]?.label || d.create_date || "").match(/\d{4}/)?.[0] || "",
      journal: "", publisher: "Northwestern University Library",
      volume: "", issue: "", pages: "", doi: "",
      url: d.canonical_link || `https://dc.library.northwestern.edu/items/${d.id}`,
      abstract: stripHtml(Array.isArray(d.description) ? d.description[0] : (d.description || "")),
      isOA: true, type: "manuscript",
      previewImage: d.thumbnail || (d.representative_file_set?.url ? `${d.representative_file_set.url}/full/300,/0/default.jpg` : "")
    }));
    return { results, hasMore: offset + results.length < total };
  }
};

/* === 13. PRINCETON DPUL === */
export const PRINCETON_DPUL_ADAPTER = {
  id: "PRINCETON_DPUL", name: "Princeton DPUL",
  tagline: "Digital PUL · Islamic, Persian Sufi & Shi'i manuscripts",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["mena", "south-asia", "global"],
  archiveType: ["manuscript-collection", "library"], contentType: ["manuscript", "textual", "primary-source"],
  color: { bg: "bg-orange-800", text: "text-orange-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const page = Math.floor(offset / pageSize) + 1;
    const url = `https://dpul.princeton.edu/catalog.json?q=${encodeURIComponent(query)}&per_page=${pageSize}&page=${page}`;
    const r = await proxiedFetch(url);
    if (!r.ok) throw new Error(`Princeton DPUL ${r.status}`);
    const data = await r.json();
    const docs = data.data || data.response?.docs || [];
    const total = data.meta?.pages?.total_count || data.response?.numFound || docs.length;
    const getAttr = (item, field) => {
      const a = item.attributes?.[field];
      if (!a) return "";
      if (typeof a === "string") return a;
      if (a.attributes?.value) return a.attributes.value;
      return Array.isArray(a) ? a.join(", ") : (a.value || "");
    };
    const results = docs.map((d, i) => {
      const title = getAttr(d, "title_tsim") || getAttr(d, "title_display") || getAttr(d, "readonly_title_ssim") || "Untitled";
      const author = getAttr(d, "author_tsim") || getAttr(d, "creator_tsim") || getAttr(d, "author_display");
      const dateRaw = getAttr(d, "pub_date_start_sort") || getAttr(d, "date_tsim") || getAttr(d, "pub_date");
      return {
        id: `dpul-${d.id || `${offset}-${i}`}`, source: "PRINCETON_DPUL",
        title: typeof title === "string" ? title : (Array.isArray(title) ? title.join(", ") : "Untitled"),
        authors: author ? [String(author)] : [],
        year: String(dateRaw).match(/\d{4}/)?.[0] || "",
        journal: "", publisher: "Princeton University Library",
        volume: "", issue: "", pages: "", doi: "",
        url: d.links?.self || `https://dpul.princeton.edu/catalog/${d.id}`,
        abstract: stripHtml(getAttr(d, "description_tsim") || getAttr(d, "summary")),
        isOA: true, type: "manuscript"
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};

/* === 14. PANGAEA === */
export const PANGAEA_ADAPTER = {
  id: "PANGAEA", name: "PANGAEA",
  tagline: "Earth & environment data · archaeogenetic metadata",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["genomic-database", "archaeological-database", "research-repository"],
  contentType: ["genomic-data", "structured-data", "primary-source"],
  color: { bg: "bg-teal-900", text: "text-teal-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const body = {
      query: { query_string: { query } }, size: pageSize, from: offset,
      _source: ["sf-authortitle", "agg-author", "agg-pubYear", "URI", "abstract"]
    };
    const r = await proxiedFetch("https://ws.pangaea.de/es/pangaea/panmd/_search", { method: "POST", body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`PANGAEA ${r.status}`);
    const data = await r.json();
    const hits = data.hits?.hits || [];
    const total = data.hits?.total?.value ?? data.hits?.total ?? hits.length;
    const results = hits.map((h, i) => {
      const s = h._source || {};
      const url = s.URI || "";
      const doi = (s.URI || "").match(/10\.\d+\/[^\s]+$/)?.[0] || "";
      return {
        id: `pangaea-${h._id || `${offset}-${i}`}`, source: "PANGAEA",
        title: s["sf-authortitle"] || "Untitled",
        authors: (s["agg-author"] || []).filter(Boolean),
        year: s["agg-pubYear"] ? String(s["agg-pubYear"]) : "",
        journal: "", publisher: "PANGAEA",
        volume: "", issue: "", pages: "",
        doi, url: url || (doi ? `https://doi.org/${doi}` : ""),
        abstract: stripHtml(s.abstract || ""), isOA: true, type: "genomic-data"
      };
    });
    return { results, hasMore: offset + hits.length < total };
  }
};

/* === 15. OPENNEURO === */
export const OPENNEURO_ADAPTER = {
  id: "OPENNEURO", name: "OpenNeuro",
  tagline: "BIDS neuroimaging datasets · client-side filtered text match",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["research-repository"],
  contentType: ["structured-data", "primary-source"],
  color: { bg: "bg-violet-900", text: "text-violet-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const gqlQuery = `query PublicDatasets { datasets(first: 100, orderBy: { created: descending }) { edges { node { id created latestSnapshot { tag description { Name Authors DatasetDOI Acknowledgements } summary { modalities tasks } } } } } }`;
    const onUrl = "https://openneuro.org/crn/graphql";
    let r;
    try {
      r = await fetch(onUrl, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query: gqlQuery }) });
    } catch {
      r = await proxiedFetch(onUrl, { method: "POST", body: JSON.stringify({ query: gqlQuery }) });
    }
    if (!r.ok) throw new Error(`OpenNeuro ${r.status}`);
    const data = await r.json();
    if (data.errors) throw new Error(`OpenNeuro GraphQL: ${data.errors[0]?.message || "unknown error"}`);
    const allDatasets = (data.data?.datasets?.edges || []).map(e => e.node);
    const q = query.toLowerCase();
    const matched = allDatasets.filter(ds => {
      const desc = ds.latestSnapshot?.description || {};
      const summary = ds.latestSnapshot?.summary || {};
      return [desc.Name || "", (desc.Authors || []).join(" "), desc.Acknowledgements || "", (summary.tasks || []).join(" "), (summary.modalities || []).join(" ")].join(" ").toLowerCase().includes(q);
    });
    const slice = matched.slice(offset, offset + pageSize);
    const results = slice.map((ds, i) => {
      const desc = ds.latestSnapshot?.description || {};
      const summary = ds.latestSnapshot?.summary || {};
      return {
        id: `on-${ds.id}-${i}`, source: "OPENNEURO",
        title: desc.Name || ds.id, authors: desc.Authors || [],
        year: String(ds.created || "").match(/\d{4}/)?.[0] || "",
        journal: (summary.modalities || []).join(", "), publisher: "OpenNeuro",
        volume: "", issue: "", pages: "", doi: desc.DatasetDOI || "",
        url: `https://openneuro.org/datasets/${ds.id}`,
        abstract: desc.Acknowledgements || `Tasks: ${(summary.tasks || []).join(", ")}`,
        isOA: true, type: "structured-data"
      };
    });
    return { results, hasMore: offset + slice.length < matched.length };
  }
};

/* === 16. ENA === */
export const ENA_ADAPTER = {
  id: "ENA", name: "ENA",
  tagline: "European Nucleotide Archive · ancient DNA, genomic studies",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"], archiveType: ["genomic-database"], contentType: ["genomic-data"],
  color: { bg: "bg-cyan-800", text: "text-cyan-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const fields = "study_accession,study_title,study_description,first_public,center_name,study_alias";
    const enaQuery = `study_title="*${query}*" OR study_description="*${query}*"`;
    const url = `https://www.ebi.ac.uk/ena/portal/api/search?result=study&query=${encodeURIComponent(enaQuery)}&fields=${fields}&format=json&limit=${pageSize}&offset=${offset}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      if (r.status === 400) throw new Error("ENA: query syntax rejected. Try simpler terms.");
      throw new Error(`ENA ${r.status}`);
    }
    const data = await r.json();
    const items = Array.isArray(data) ? data : [];
    const results = items.map((it, i) => ({
      id: `ena-${it.study_accession || `${offset}-${i}`}`, source: "ENA",
      title: it.study_title || it.study_alias || "Untitled study",
      authors: it.center_name ? [it.center_name] : [],
      year: String(it.first_public || "").slice(0, 4),
      journal: it.study_accession || "", publisher: "European Nucleotide Archive",
      volume: "", issue: "", pages: "", doi: "",
      url: it.study_accession ? `https://www.ebi.ac.uk/ena/browser/view/${it.study_accession}` : "",
      abstract: stripHtml(it.study_description || ""), isOA: true, type: "genomic-data"
    }));
    return { results, hasMore: items.length === pageSize };
  }
};
