import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

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
      abstract: a.longTitle || "",
      isOA: true,
      // R3: imgonly=true in the search query guarantees visual art objects
      type: "image",
      // R6: objectTypes + materials populate the Topics facet (present in collection API response)
      subjects: [
        ...(Array.isArray(a.objectTypes)  ? a.objectTypes  : []),
        ...(Array.isArray(a.materials)    ? a.materials    : []),
        ...(Array.isArray(a.productionPlaces) ? a.productionPlaces : []),
      ].filter(Boolean),
      previewImage: a.webImage?.url || a.headerImage?.url || ""
    }));
    return { results, hasMore: offset + results.length < (data.count || 0) };
  }
};
