import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";
import { stripHtml } from "../../lib/helpers.js";

// R3: Europeana native type → UnifiedResult type
const EUROPEANA_TYPE_MAP = {
  "IMAGE": "image",
  "TEXT":  "primary-source",
  "SOUND": "misc",
  "VIDEO": "misc",
  "3D":    "primary-source",
};

export const EUROPEANA_ADAPTER = {
  id: "EUROPEANA", name: "Europeana",
  tagline: "Cultural heritage · museums · primary sources",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe"], archiveType: ["aggregator", "museum", "library"],
  contentType: ["primary-source", "visual", "manuscript", "ephemera"],
  color: { bg: "bg-emerald-900", text: "text-emerald-50" },
  needsKey: false,
  capability: {
    protocol: "rest-json", fulltext: false, pagination: "offset", totalCount: true, maxWindow: null, auth: "key",
    rankFields: { abstract: "full", subjects: "full", citedBy: false },
    serverSafe: true,
    corpusSize: 58000000, // ~58M digitised records, europeana.eu
  },
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    // BROWSER, no user key: ask our own backend (same-origin, no key on the wire).
    // TRANSITIONAL (v0.34): if the user supplied their own Europeana key, fall through to
    // the direct-upstream path below (pre-WS-A client behavior). This keeps Europeana live
    // in the browser until the project-level EUROPEANA_API_KEY env is provisioned; once it
    // is, drop europeanaKey from Settings/defaults and this branch becomes backend-only.
    if (typeof window !== "undefined" && !settings.europeanaKey) {
      const r = await fetch(`/api/search/europeana?q=${encodeURIComponent(query)}&offset=${offset}`);
      if (!r.ok) throw new Error(`Europeana ${r.status}`);
      return await r.json();                       // { results, hasMore } — already normalized server-side
    }
    // SERVER (env key injected by caller) OR BROWSER with a user-supplied key: direct upstream.
    if (!settings.europeanaKey) throw new Error("EUROPEANA_API_KEY not configured");  // backend config error
    const rows = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const start = offset + 1;
    const url = `https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(settings.europeanaKey)}&query=${encodeURIComponent(query)}&rows=${rows}&start=${start}&profile=rich`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Europeana ${r.status}`);
    const data = await r.json();
    if (data.success === false) throw new Error(data.error || "Europeana request rejected.");
    const results = (data.items || []).map((it, i) => {
      const title = Array.isArray(it.title) ? it.title[0] : (it.title || "Untitled");
      const creators = it.dcCreator || it.edmAgentLabel || [];
      const year = (it.year && it.year[0]) || (it.edmTimespanLabel && it.edmTimespanLabel[0]?.def) || "";

      // R3: use native Europeana type; fall back to primary-source
      const nativeType = Array.isArray(it.type) ? it.type[0] : (it.type || "");
      const resolvedType = EUROPEANA_TYPE_MAP[String(nativeType).toUpperCase()] || "primary-source";

      // R3: language is available in profile=rich
      const lang = Array.isArray(it.language) ? it.language[0] : (it.language || "");

      // R6: subjects from dcSubject (Dublin Core)
      const subjects = Array.isArray(it.dcSubject)
        ? it.dcSubject.filter(Boolean)
        : (it.dcSubject ? [it.dcSubject] : []);

      return {
        id: `eu-${it.id || `${offset}-${i}`}`, source: "EUROPEANA",
        title: stripHtml(title),
        authors: Array.isArray(creators) ? creators.filter(Boolean) : [],
        year: String(year || "").slice(0, 4), journal: "",
        publisher: (it.dataProvider && it.dataProvider[0]) || "",
        volume: "", issue: "", pages: "", doi: "",
        url: (it.edmIsShownAt && it.edmIsShownAt[0]) || it.guid || "",
        abstract: stripHtml((it.dcDescription && it.dcDescription[0]) || ""),
        isOA: true,
        type: resolvedType,
        language: lang,
        subjects,
        previewImage: (it.edmPreview && it.edmPreview[0]) || ""
      };
    });
    return { results, hasMore: offset + results.length < (data.totalResults || 0) };
  }
};
