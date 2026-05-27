import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

export const MET_ADAPTER = {
  id: "MET", name: "The Met",
  tagline: "Metropolitan Museum of Art · 470,000+ artworks",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global", "north-america"], archiveType: ["museum"], contentType: ["visual", "primary-source"],
  color: { bg: "bg-red-800", text: "text-red-50" }, needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const q = encodeURIComponent(query);
    const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/search?q=${q}&hasImages=true&artistOrCulture=true`);
    if (!r.ok) throw new Error(`Met ${r.status}`);
    const data = await r.json();
    const allIds = data.objectIDs || [];
    // Fetch a wider slice then relevance-filter, so we can fill the page even after filtering
    const fetchSlice = allIds.slice(offset, offset + pageSize * 3);
    const items = await Promise.all(fetchSlice.map(async id => {
      try {
        const ir = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
        return ir.ok ? await ir.json() : null;
      } catch { return null; }
    }));
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const relevant = items.filter(it => {
      if (!it) return false;
      const haystack = [it.title, it.culture, it.artistDisplayName, it.artistNationality,
        it.classification, it.period, it.department, ...(it.tags?.map(t => t.term) || [])]
        .filter(Boolean).join(" ").toLowerCase();
      return terms.some(t => haystack.includes(t));
    }).slice(0, pageSize);
    const results = relevant.map(it => ({
      id: `met-${it.objectID}`, source: "MET",
      title: it.title || "Untitled",
      authors: it.artistDisplayName ? [it.artistDisplayName] : [],
      year: it.objectDate || (it.objectBeginDate ? String(it.objectBeginDate) : ""),
      journal: it.department || "", publisher: "The Metropolitan Museum of Art",
      volume: "", issue: "", pages: "", doi: "",
      url: it.objectURL || "",
      abstract: [it.medium, it.dimensions, it.creditLine].filter(Boolean).join(". "),
      isOA: it.isPublicDomain === true,
      // R3: always visual artworks — hasImages:true filter is in the search query
      type: "image",
      // R6: classification/culture/period power the Topics facet filter
      subjects: [it.classification, it.culture, it.period, it.artistNationality].filter(Boolean),
      previewImage: it.primaryImageSmall || it.primaryImage || ""
    }));
    return { results, hasMore: offset + fetchSlice.length < allIds.length };
  }
};
