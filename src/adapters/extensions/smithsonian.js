import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

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
      // R6: object type, topic, and cultural provenance → subjects for Topics facet
      const subjects = [
        ...(Array.isArray(idx.type)       ? idx.type    : []),
        ...(Array.isArray(idx.topic)      ? idx.topic   : []),
        ...(Array.isArray(idx.culture)    ? idx.culture : []),
        ...(Array.isArray(idx.set_name)   ? idx.set_name: []),
      ].filter(Boolean);
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
        subjects,
        previewImage: desc.online_media?.media?.[0]?.thumbnail || ""
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};
