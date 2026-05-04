import React, { useState, useRef, useEffect, useCallback } from "react";

/* ============================================================================
   OpenCITE — v.05
   A meta-search across free, open-access scholarly databases.

   ADDING A NEW SOURCE:
   1. Write an adapter object below following the shape of the existing ones.
   2. Push it into the ADAPTERS array.
   3. The UI auto-renders a section for it. Done.

   Each adapter must expose:
     - id:        unique short string (used as React key, badge color lookup)
     - name:      display name
     - tagline:   short description shown under the section header
     - color:     { bg, text } for the badge (Tailwind classes)
     - search:    async (query, settings) => { results: UnifiedResult[], error?: string }
     - needsKey:  optional boolean — show in settings panel

   UnifiedResult shape (all fields optional except title):
     { id, source, title, authors[], year, journal, publisher,
       volume, issue, pages, doi, url, abstract, isOA, type }
============================================================================ */

// ---------- Helpers ----------

const reconstructAbstract = (invertedIndex) => {
  if (!invertedIndex || typeof invertedIndex !== "object") return "";
  const positions = [];
  for (const [word, posList] of Object.entries(invertedIndex)) {
    if (Array.isArray(posList)) {
      for (const pos of posList) positions.push([pos, word]);
    }
  }
  positions.sort((a, b) => a[0] - b[0]);
  return positions.map(p => p[1]).join(" ");
};

const truncate = (s, n) => (s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s || "");

const stripHtml = (s) => (s || "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").trim();

// ---------- CORS PROXY ----------
// SSOT for CORS-blocked endpoints. Adapters on pattern 2 call proxiedFetch()
// instead of fetch(). Single line swap per adapter — easy to revert.
// The /api/proxy Vercel function handles UA injection + allowlist gating.
const PROXY_BASE = "/api/proxy";
async function proxiedFetch(url, options = {}) {
  const proxyUrl = `${PROXY_BASE}?url=${encodeURIComponent(url)}` +
    (options.method && options.method !== "GET" ? `&method=${options.method}` : "");
  const fetchOpts = options.method === "POST"
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: options.body }
    : {};
  return fetch(proxyUrl, fetchOpts);
}

// ---------- STORAGE ----------
// Single source of truth for all localStorage access. Namespaced keys so
// future features (library, prefs, etc.) don't collide with anything else
// the deployed page might run.
const STORAGE_NS = "opencite";
const ns = (key) => `${STORAGE_NS}:${key}`;

const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(ns(key));
      if (raw === null) return fallback;
      try { return JSON.parse(raw); } catch { return raw; }
    } catch { return fallback; }
  },
  set(key, value) {
    try {
      const serialized = typeof value === "string" ? value : JSON.stringify(value);
      localStorage.setItem(ns(key), serialized);
    } catch {}
  },
  remove(key) {
    try { localStorage.removeItem(ns(key)); } catch {}
  }
};

// ---------- HISTORY ----------
const HISTORY_MAX = 50;

const history = {
  load() {
    const raw = storage.get("history", []);
    return Array.isArray(raw) ? raw : [];
  },
  add(query) {
    const q = (query || "").trim();
    if (!q) return;
    const existing = history.load();
    // Dedupe: remove any prior entry for this query, push new to front
    const filtered = existing.filter(e => e.query !== q);
    const next = [{ query: q, ts: Date.now() }, ...filtered].slice(0, HISTORY_MAX);
    storage.set("history", next);
    return next;
  },
  remove(query) {
    const existing = history.load();
    const next = existing.filter(e => e.query !== query);
    storage.set("history", next);
    return next;
  },
  clear() {
    storage.set("history", []);
    return [];
  }
};

// ---------- LIBRARY ----------
// Saved results. Deduped by DOI when present, else by composite source:id key.
const libraryKey = (result) => {
  if (result.doi) return `doi:${result.doi.toLowerCase()}`;
  return `${result.source}:${result.id}`;
};

const library = {
  load() {
    const raw = storage.get("library", []);
    return Array.isArray(raw) ? raw : [];
  },
  has(result) {
    const key = libraryKey(result);
    return library.load().some(item => libraryKey(item) === key);
  },
  add(result) {
    const existing = library.load();
    const key = libraryKey(result);
    if (existing.some(item => libraryKey(item) === key)) return existing;
    const stamped = { ...result, savedAt: Date.now() };
    const next = [stamped, ...existing];
    storage.set("library", next);
    return next;
  },
  remove(result) {
    const key = libraryKey(result);
    const next = library.load().filter(item => libraryKey(item) !== key);
    storage.set("library", next);
    return next;
  },
  clear() {
    storage.set("library", []);
    return [];
  }
};

// ---------- THEMES ----------
// Each theme defines the full set of UI surface colors. Badge colors per
// source (DOAJ amber, OpenAlex stone, etc.) stay constant across themes
// because they're brand identity, not UI chrome.
const THEMES = {
  tan: {
    label: "Tan",
    bg: "radial-gradient(ellipse at top, #f5ecd9 0%, #ede0c4 60%, #e4d3b0 100%)",
    swatch: "#e4d3b0",
    fg: "#1c1917",
    fgMuted: "#44403c",
    fgSubtle: "#78716c",
    border: "#1c1917",
    borderSubtle: "#d6d3d1",
    surface: "rgba(250, 250, 249, 0.4)",
    accent: "#7f1d1d",
    onAccent: "#fef3c7",
    buttonBg: "#1c1917",
    settingsBg: "#fef3c7",
    inputBg: "#ffffff",
    grainOpacity: 0.04
  },
  blueGrey: {
    label: "Blue-grey",
    bg: "radial-gradient(ellipse at top, #e2e8f0 0%, #cbd5e1 60%, #94a3b8 100%)",
    swatch: "#94a3b8",
    fg: "#0f172a",
    fgMuted: "#334155",
    fgSubtle: "#64748b",
    border: "#0f172a",
    borderSubtle: "#cbd5e1",
    surface: "rgba(241, 245, 249, 0.5)",
    accent: "#1e3a8a",
    onAccent: "#dbeafe",
    buttonBg: "#0f172a",
    settingsBg: "#dbeafe",
    inputBg: "#ffffff",
    grainOpacity: 0.03
  },
  dark: {
    label: "Dark",
    bg: "radial-gradient(ellipse at top, #1f2937 0%, #111827 60%, #030712 100%)",
    swatch: "#1f2937",
    fg: "#fafaf9",
    fgMuted: "#a8a29e",
    fgSubtle: "#78716c",
    border: "#fafaf9",
    borderSubtle: "#3f3f46",
    surface: "rgba(63, 63, 70, 0.3)",
    accent: "#fbbf24",
    onAccent: "#1c1917",
    buttonBg: "#fafaf9",
    settingsBg: "rgba(120, 113, 108, 0.18)",
    inputBg: "rgba(0, 0, 0, 0.3)",
    grainOpacity: 0.06
  },
  porphyry: {
    label: "Porphyry & Gold",
    bg: "radial-gradient(ellipse at top, #581c1c 0%, #3b0d0d 60%, #1a0606 100%)",
    swatch: "#581c1c",
    fg: "#fde68a",
    fgMuted: "#d4a574",
    fgSubtle: "#a08560",
    border: "#fbbf24",
    borderSubtle: "#7c2d12",
    surface: "rgba(127, 29, 29, 0.35)",
    accent: "#fef3c7",
    onAccent: "#3b0d0d",
    buttonBg: "#d4af37",
    settingsBg: "rgba(127, 29, 29, 0.4)",
    inputBg: "rgba(0, 0, 0, 0.25)",
    grainOpacity: 0.05
  }
};

const DEFAULT_THEME = "tan";

// ---------- HELPERS / CONSTANTS USED BY ADAPTERS ----------

// Pre-populated curated journals list. Users can edit this in settings.
const DEFAULT_CURATED_JOURNALS = [
  { name: "Ecological Informatics", issn: "1574-9541" },
  { name: "Ecosphere", issn: "2150-8925" },
  { name: "Frontiers in Marine Science", issn: "2296-7745" },
  { name: "PeerJ", issn: "2167-8359" }
];

// Shared OpenAlex parser used by both OPENALEX and CURATED_JOURNALS adapters.
const parseOpenAlexWork = (w, idx) => {
  const oaUrl = w.open_access?.oa_url || w.primary_location?.landing_page_url || "";
  const doi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//, "") : "";
  return {
    id: `oa-${w.id?.split("/").pop() || idx}`,
    source: "OPENALEX",
    title: w.title || w.display_name || "Untitled",
    authors: (w.authorships || []).map(a => a.author?.display_name).filter(Boolean),
    year: w.publication_year ? String(w.publication_year) : "",
    journal: w.primary_location?.source?.display_name || w.host_venue?.display_name || "",
    publisher: w.primary_location?.source?.host_organization_name || "",
    volume: w.biblio?.volume || "",
    issue: w.biblio?.issue || "",
    pages: w.biblio?.first_page && w.biblio?.last_page ? `${w.biblio.first_page}-${w.biblio.last_page}` : (w.biblio?.first_page || ""),
    doi,
    url: oaUrl || (doi ? `https://doi.org/${doi}` : ""),
    abstract: reconstructAbstract(w.abstract_inverted_index),
    isOA: !!w.open_access?.is_oa,
    type: w.type || "article"
  };
};

// ---------- TAG VOCABULARY & CATEGORIES ----------
// Declared before any adapter because adapters reference these in their definitions.
// JS const has a temporal dead zone — referencing them before declaration throws.
//
// Tag values are drawn from UN M.49 region codes, OCLC/ICA archive type vocabulary,
// and EDM (Europeana Data Model) content types. Used for filtering in settings,
// rendering tag pills, and grouping the launcher list by region.
const TAG_VOCAB = {
  region: {
    "global": "Global",
    "north-america": "North America",
    "europe": "Europe",
    "latin-america": "Latin America & Iberian",
    "mena": "Middle East & North Africa",
    "north-africa": "North Africa",
    "sahel": "Sahel",
    "south-asia": "South Asia",
    "central-asia": "Central Asia",
    "east-asia": "East Asia",
    "west-africa": "West Africa",
    "sub-saharan-africa": "Sub-Saharan Africa"
  },
  archiveType: {
    "aggregator": "Aggregator",
    "scholarly-index": "Scholarly Index",
    "museum": "Museum",
    "library": "Library",
    "manuscript-collection": "Manuscript Collection",
    "national-archive": "National Archive",
    "research-repository": "Research Repository",
    "audiovisual-archive": "Audiovisual Archive",
    "genomic-database": "Genomic Database",
    "archaeological-database": "Archaeological Database",
    "ethnographic-database": "Ethnographic Database",
    "sparql-endpoint": "SPARQL Endpoint"
  },
  contentType: {
    "peer-reviewed": "Peer-reviewed",
    "textual": "Textual",
    "visual": "Visual",
    "manuscript": "Manuscript",
    "primary-source": "Primary Source",
    "audio": "Audio",
    "3d": "3D",
    "ephemera": "Ephemera",
    "genomic-data": "Genomic Data",
    "archaeological-data": "Archaeological Data",
    "ethnographic-data": "Ethnographic Data",
    "structured-data": "Structured Data"
  }
};

const ADAPTER_CATEGORY = { CORE: "core", EXTENSION: "extension" };

// ---------- ADAPTERS ----------

const DOAJ_ADAPTER = {
  id: "DOAJ",
  name: "DOAJ",
  tagline: "Directory of Open Access Journals · peer-reviewed",
  category: ADAPTER_CATEGORY.CORE,
  region: ["global"],
  archiveType: ["scholarly-index"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-amber-900", text: "text-amber-50" },
  needsKey: false,
  initialPageSize: 3,
  loadMorePageSize: 5,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    // DOAJ uses 1-based pagination
    const page = Math.floor(offset / pageSize) + 1;
    const url = `https://doaj.org/api/v3/search/articles/${encodeURIComponent(query)}?pageSize=${pageSize}&page=${page}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`DOAJ ${r.status}`);
    const data = await r.json();
    const results = (data.results || []).map((a, i) => {
      const b = a.bibjson || {};
      const doi = (b.identifier || []).find(x => x.type === "doi")?.id || "";
      const fulltext = (b.link || []).find(x => x.type === "fulltext")?.url || "";
      return {
        id: `doaj-${a.id || `${offset}-${i}`}`,
        source: "DOAJ",
        title: b.title || "Untitled",
        authors: (b.author || []).map(x => x.name).filter(Boolean),
        year: b.year ? String(b.year) : "",
        journal: b.journal?.title || "",
        publisher: b.journal?.publisher || "",
        volume: b.journal?.volume || "",
        issue: b.journal?.number || "",
        pages: b.start_page && b.end_page ? `${b.start_page}-${b.end_page}` : (b.start_page || ""),
        doi,
        url: fulltext || (doi ? `https://doi.org/${doi}` : ""),
        abstract: stripHtml(b.abstract || ""),
        isOA: true,
        type: "article"
      };
    });
    const total = data.total || 0;
    const hasMore = offset + results.length < total;
    return { results, hasMore };
  }
};

const OPENALEX_ADAPTER = {
  id: "OPENALEX",
  name: "OpenAlex",
  tagline: "250M+ scholarly works · OA-filtered",
  category: ADAPTER_CATEGORY.CORE,
  region: ["global"],
  archiveType: ["scholarly-index", "aggregator"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-stone-800", text: "text-stone-50" },
  needsKey: false,
  keyName: "openAlexKey",
  keyLabel: "OpenAlex API key (optional)",
  keyHelp: "Optional. Works without a key via the polite pool (rate-limited). For higher quotas, get a free key at openalex.org/settings/api — 30-second signup.",
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    const page = Math.floor(offset / pageSize) + 1;
    // Auth strategy: prefer api_key; fall back to polite-pool mailto; otherwise unauthenticated.
    let auth = "";
    if (settings.openAlexKey) {
      auth = `&api_key=${encodeURIComponent(settings.openAlexKey)}`;
    } else if (settings.crossrefEmail) {
      auth = `&mailto=${encodeURIComponent(settings.crossrefEmail)}`;
    }
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=is_oa:true&per_page=${pageSize}&page=${page}${auth}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new Error("OpenAlex rejected the request. If you've added a key, verify it in settings; otherwise try removing it.");
      if (r.status === 429) throw new Error("OpenAlex rate limit hit. Adding a free API key in settings raises your quota considerably.");
      throw new Error(`OpenAlex ${r.status}`);
    }
    const data = await r.json();
    const results = (data.results || []).map((w, i) => parseOpenAlexWork(w, `${offset}-${i}`));
    const total = data.meta?.count || 0;
    const hasMore = offset + results.length < total;
    return { results, hasMore };
  }
};

const CROSSREF_ADAPTER = {
  id: "CROSSREF",
  name: "Crossref",
  tagline: "DOI authority · 130M+ scholarly works",
  category: ADAPTER_CATEGORY.CORE,
  region: ["global"],
  archiveType: ["scholarly-index"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-red-900", text: "text-red-50" },
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    const mailto = settings.crossrefEmail ? `&mailto=${encodeURIComponent(settings.crossrefEmail)}` : "";
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${pageSize}&offset=${offset}${mailto}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Crossref ${r.status}`);
    const data = await r.json();
    const items = data.message?.items || [];
    const results = items.map((it, i) => {
      const doi = it.DOI || "";
      const title = Array.isArray(it.title) ? it.title[0] : (it.title || "Untitled");
      const authors = (it.author || [])
        .map(a => [a.given, a.family].filter(Boolean).join(" "))
        .filter(Boolean);
      const dateParts = it.issued?.["date-parts"]?.[0] || it.published?.["date-parts"]?.[0] || [];
      const year = dateParts[0] ? String(dateParts[0]) : "";
      const journal = Array.isArray(it["container-title"]) ? it["container-title"][0] : (it["container-title"] || "");
      return {
        id: `cr-${doi || `${offset}-${i}`}`,
        source: "CROSSREF",
        title: stripHtml(title),
        authors,
        year,
        journal,
        publisher: it.publisher || "",
        volume: it.volume || "",
        issue: it.issue || "",
        pages: it.page || "",
        doi,
        url: it.URL || (doi ? `https://doi.org/${doi}` : ""),
        abstract: stripHtml(it.abstract || ""),
        // Crossref doesn't reliably mark OA status — be honest with the user
        isOA: false,
        type: "article"
      };
    });
    const total = data.message?.["total-results"] || 0;
    const hasMore = offset + results.length < total;
    return { results, hasMore };
  }
};

const SEMANTIC_SCHOLAR_ADAPTER = {
  id: "S2",
  name: "Semantic Scholar",
  tagline: "AI-curated · cross-disciplinary · requires free API key",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"],
  archiveType: ["scholarly-index"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-orange-800", text: "text-orange-50" },
  needsKey: true,
  keyName: "s2Key",
  keyLabel: "Semantic Scholar API key",
  keyHelp: "Free but requires approval (can take days). Request at semanticscholar.org/product/api.",
  search: async (query, settings, opts = {}) => {
    if (!settings.s2Key) {
      throw new Error("Semantic Scholar requires an API key. Add yours in settings (⚙) — it's free but takes a few days for approval.");
    }
    const offset = opts.offset || 0;
    const limit = offset === 0 ? 3 : 5;
    const fields = "title,authors,year,venue,abstract,openAccessPdf,externalIds,journal";
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}&fields=${fields}`;
    const r = await fetch(url, {
      headers: { Accept: "application/json", "x-api-key": settings.s2Key }
    });
    if (!r.ok) {
      if (r.status === 429) throw new Error("Semantic Scholar rate-limited even with key. Try again in a moment.");
      if (r.status === 403) throw new Error("Semantic Scholar API key invalid or unauthorized. Verify in settings.");
      throw new Error(`Semantic Scholar ${r.status}`);
    }
    const data = await r.json();
    const results = (data.data || []).map((p, i) => {
      const doi = p.externalIds?.DOI || "";
      const oaUrl = p.openAccessPdf?.url || "";
      return {
        id: `s2-${p.paperId || `${offset}-${i}`}`,
        source: "S2",
        title: p.title || "Untitled",
        authors: (p.authors || []).map(a => a.name).filter(Boolean),
        year: p.year ? String(p.year) : "",
        journal: p.journal?.name || p.venue || "",
        publisher: "",
        volume: p.journal?.volume || "",
        issue: "",
        pages: p.journal?.pages || "",
        doi,
        url: oaUrl || (doi ? `https://doi.org/${doi}` : (p.paperId ? `https://www.semanticscholar.org/paper/${p.paperId}` : "")),
        abstract: p.abstract || "",
        isOA: !!oaUrl,
        type: "article"
      };
    });
    const total = data.total || 0;
    const hasMore = offset + results.length < total;
    return { results, hasMore };
  }
};

const EUROPEANA_ADAPTER = {
  id: "EUROPEANA",
  name: "Europeana",
  tagline: "Cultural heritage · museums · primary sources",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe"],
  archiveType: ["aggregator", "museum", "library"],
  contentType: ["primary-source", "visual", "manuscript", "ephemera"],
  color: { bg: "bg-emerald-900", text: "text-emerald-50" },
  needsKey: true,
  keyName: "europeanaKey",
  keyLabel: "Europeana API key",
  keyHelp: "Free, instant. Register at api.europeana.eu — paste the key here.",
  search: async (query, settings, opts = {}) => {
    if (!settings.europeanaKey) {
      throw new Error("Europeana needs a free API key. Open settings (⚙) to add yours.");
    }
    const offset = opts.offset || 0;
    const rows = offset === 0 ? 3 : 5;
    // Europeana 'start' is 1-indexed
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
      const provider = (it.dataProvider && it.dataProvider[0]) || "";
      const description = (it.dcDescription && it.dcDescription[0]) || "";
      const link = (it.edmIsShownAt && it.edmIsShownAt[0]) || it.guid || "";
      const previewImage = (it.edmPreview && it.edmPreview[0]) || "";
      return {
        id: `eu-${it.id || `${offset}-${i}`}`,
        source: "EUROPEANA",
        title: stripHtml(title),
        authors: Array.isArray(creators) ? creators.filter(Boolean) : [],
        year: String(year || "").slice(0, 4),
        journal: "",
        publisher: provider,
        volume: "", issue: "", pages: "",
        doi: "",
        url: link,
        abstract: stripHtml(description),
        isOA: true,
        type: "primary-source",
        previewImage
      };
    });
    const total = data.totalResults || 0;
    const hasMore = offset + results.length < total;
    return { results, hasMore };
  }
};

const CURATED_JOURNALS_ADAPTER = {
  id: "CURATED",
  name: "Curated Journals",
  tagline: "Your hand-picked trusted sources · powered by OpenAlex",
  category: ADAPTER_CATEGORY.CORE,
  region: ["global"],
  archiveType: ["scholarly-index"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-amber-700", text: "text-amber-50" },
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const journals = settings.curatedJournals || [];
    const issns = journals.map(j => j.issn).filter(Boolean);
    if (issns.length === 0) {
      throw new Error("No curated journals configured. Add some in settings (⚙).");
    }
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 5 : 5;
    const page = Math.floor(offset / pageSize) + 1;
    const issnFilter = issns.join("|");
    // Auth strategy mirrors OPENALEX_ADAPTER: key → mailto polite-pool → unauthenticated
    let auth = "";
    if (settings.openAlexKey) {
      auth = `&api_key=${encodeURIComponent(settings.openAlexKey)}`;
    } else if (settings.crossrefEmail) {
      auth = `&mailto=${encodeURIComponent(settings.crossrefEmail)}`;
    }
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=primary_location.source.issn:${issnFilter}&per_page=${pageSize}&page=${page}${auth}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new Error("OpenAlex rejected the request. If you've added a key, verify it in settings; otherwise try removing it.");
      if (r.status === 429) throw new Error("OpenAlex rate limit hit. Adding a free API key in settings raises your quota considerably.");
      throw new Error(`OpenAlex ${r.status}`);
    }
    const data = await r.json();
    // Use OpenAlex parser, then re-tag the source as CURATED for badge display
    const results = (data.results || []).map((w, i) => parseOpenAlexWork(w, `${offset}-${i}`)).map(item => ({ ...item, source: "CURATED" }));
    const total = data.meta?.count || 0;
    const hasMore = offset + results.length < total;
    return { results, hasMore };
  }
};

// ---------- EXTENSION ADAPTERS (opt-in, default off) ----------

const MET_ADAPTER = {
  id: "MET",
  name: "The Met",
  tagline: "Metropolitan Museum of Art · 470,000+ artworks",
  color: { bg: "bg-red-800", text: "text-red-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global", "north-america"],
  archiveType: ["museum"],
  contentType: ["visual", "primary-source"],
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    // Met's API is two-step: search returns IDs, then fetch each. Total 1 + N requests.
    const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(query)}&hasImages=true`;
    const r = await fetch(searchUrl);
    if (!r.ok) throw new Error(`Met ${r.status}`);
    const data = await r.json();
    const allIds = data.objectIDs || [];
    const slice = allIds.slice(offset, offset + pageSize);
    const items = await Promise.all(slice.map(async (id) => {
      try {
        const ir = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
        if (!ir.ok) return null;
        return await ir.json();
      } catch { return null; }
    }));
    const results = items.filter(Boolean).map((it) => ({
      id: `met-${it.objectID}`,
      source: "MET",
      title: it.title || "Untitled",
      authors: it.artistDisplayName ? [it.artistDisplayName] : [],
      year: it.objectDate || (it.objectBeginDate ? String(it.objectBeginDate) : ""),
      journal: it.department || "",
      publisher: "The Metropolitan Museum of Art",
      volume: "", issue: "", pages: "",
      doi: "",
      url: it.objectURL || "",
      abstract: [it.medium, it.dimensions, it.creditLine].filter(Boolean).join(". "),
      isOA: it.isPublicDomain === true,
      type: "primary-source",
      previewImage: it.primaryImageSmall || it.primaryImage || ""
    }));
    return { results, hasMore: offset + slice.length < allIds.length };
  }
};

const SMITHSONIAN_ADAPTER = {
  id: "SMITHSONIAN",
  name: "Smithsonian",
  tagline: "11M+ records across 19 museums",
  color: { bg: "bg-blue-900", text: "text-blue-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global", "north-america"],
  archiveType: ["museum", "research-repository"],
  contentType: ["visual", "primary-source", "3d"],
  needsKey: true,
  keyName: "smithsonianKey",
  keyLabel: "Smithsonian API key",
  keyHelp: "Free key from api.data.gov/signup — instant. Used for Smithsonian Open Access.",
  search: async (query, settings, opts = {}) => {
    if (!settings.smithsonianKey) {
      throw new Error("Smithsonian needs an api.data.gov key. Add yours in settings (⚙).");
    }
    const offset = opts.offset || 0;
    const rows = offset === 0 ? 3 : 5;
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
      const title = desc.title?.content || row.title || "Untitled";
      const authors = (Array.isArray(idx.name) ? idx.name : []).filter(Boolean);
      const date = (Array.isArray(idx.date) ? idx.date[0] : "") || "";
      const previewImage = desc.online_media?.media?.[0]?.thumbnail || "";
      const url = desc.record_link || "";
      return {
        id: `si-${row.id || `${offset}-${i}`}`,
        source: "SMITHSONIAN",
        title,
        authors,
        year: String(date).slice(0, 4),
        journal: "",
        publisher: desc.unit_code || "Smithsonian",
        volume: "", issue: "", pages: "",
        doi: "",
        url,
        abstract: c.freetext?.notes?.[0]?.content || "",
        isOA: true,
        type: "primary-source",
        previewImage
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};

const DPLA_ADAPTER = {
  id: "DPLA",
  name: "DPLA",
  tagline: "Digital Public Library of America · 50M+ items",
  color: { bg: "bg-indigo-900", text: "text-indigo-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["north-america"],
  archiveType: ["aggregator", "library"],
  contentType: ["textual", "visual", "primary-source", "manuscript"],
  needsKey: true,
  keyName: "dplaKey",
  keyLabel: "DPLA API key",
  keyHelp: "Free 32-char key. Email pro.dp.la to request — typically same-day.",
  search: async (query, settings, opts = {}) => {
    if (!settings.dplaKey) {
      throw new Error("DPLA needs a free API key. Add yours in settings (⚙).");
    }
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    const page = Math.floor(offset / pageSize) + 1;
    const url = `https://api.dp.la/v2/items?q=${encodeURIComponent(query)}&page=${page}&page_size=${pageSize}&api_key=${encodeURIComponent(settings.dplaKey)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`DPLA ${r.status}`);
    const data = await r.json();
    const docs = data.docs || [];
    const total = data.count || 0;
    const results = docs.map((d, i) => {
      const src = d.sourceResource || {};
      const title = Array.isArray(src.title) ? src.title[0] : (src.title || "Untitled");
      const creators = Array.isArray(src.creator) ? src.creator : (src.creator ? [src.creator] : []);
      const date = src.date?.displayDate || (Array.isArray(src.date) ? src.date[0]?.displayDate : "") || "";
      const desc = Array.isArray(src.description) ? src.description[0] : (src.description || "");
      const previewImage = d.object || "";
      return {
        id: `dpla-${d.id || `${offset}-${i}`}`,
        source: "DPLA",
        title,
        authors: creators,
        year: String(date).match(/\d{4}/)?.[0] || "",
        journal: "",
        publisher: d.provider?.name || "",
        volume: "", issue: "", pages: "",
        doi: "",
        url: d.isShownAt || "",
        abstract: stripHtml(desc),
        isOA: true,
        type: "primary-source",
        previewImage
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};

const RIJKSMUSEUM_ADAPTER = {
  id: "RIJKS",
  name: "Rijksmuseum",
  tagline: "Dutch Golden Age · 700,000+ objects",
  color: { bg: "bg-orange-900", text: "text-orange-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe"],
  archiveType: ["museum"],
  contentType: ["visual", "primary-source"],
  needsKey: true,
  keyName: "rijksKey",
  keyLabel: "Rijksmuseum API key",
  keyHelp: "Free, instant. Register a Rijksstudio account at rijksmuseum.nl — find key in advanced settings.",
  search: async (query, settings, opts = {}) => {
    if (!settings.rijksKey) {
      throw new Error("Rijksmuseum needs a free API key. Add yours in settings (⚙).");
    }
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    const page = Math.floor(offset / pageSize) + 1;
    const url = `https://www.rijksmuseum.nl/api/en/collection?key=${encodeURIComponent(settings.rijksKey)}&q=${encodeURIComponent(query)}&p=${page}&ps=${pageSize}&imgonly=true`;
    const r = await fetch(url);
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new Error("Rijksmuseum API key invalid.");
      throw new Error(`Rijksmuseum ${r.status}`);
    }
    const data = await r.json();
    const artObjects = data.artObjects || [];
    const total = data.count || 0;
    const results = artObjects.map((a, i) => ({
      id: `rijks-${a.objectNumber || `${offset}-${i}`}`,
      source: "RIJKS",
      title: a.title || "Untitled",
      authors: a.principalOrFirstMaker ? [a.principalOrFirstMaker] : [],
      year: a.longTitle?.match(/\b(1[0-9]{3}|20[0-9]{2})\b/)?.[0] || "",
      journal: "",
      publisher: "Rijksmuseum",
      volume: "", issue: "", pages: "",
      doi: "",
      url: a.links?.web || `https://www.rijksmuseum.nl/en/collection/${a.objectNumber}`,
      abstract: a.longTitle || "",
      isOA: true,
      type: "primary-source",
      previewImage: a.webImage?.url || a.headerImage?.url || ""
    }));
    return { results, hasMore: offset + results.length < total };
  }
};

const INTERNET_ARCHIVE_ADAPTER = {
  id: "IA",
  name: "Internet Archive",
  tagline: "42M+ texts · scholarly, historical, ephemeral",
  color: { bg: "bg-stone-700", text: "text-stone-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"],
  archiveType: ["aggregator", "library", "audiovisual-archive"],
  contentType: ["textual", "audio", "primary-source", "ephemera"],
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    const page = Math.floor(offset / pageSize) + 1;
    // Use cors.archive.org (IA's explicit CORS-enabled subdomain)
    const fields = "identifier,title,creator,date,description,mediatype,collection";
    const params = `q=${encodeURIComponent(query + " AND mediatype:texts")}&fl[]=${fields.split(",").join("&fl[]=")}&rows=${pageSize}&page=${page}&output=json`;
    const url = `https://archive.org/advancedsearch.php?${params}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Internet Archive ${r.status}`);
    const data = await r.json();
    const docs = data.response?.docs || [];
    const total = data.response?.numFound || 0;
    const results = docs.map((d, i) => {
      const creator = Array.isArray(d.creator) ? d.creator : (d.creator ? [d.creator] : []);
      const desc = Array.isArray(d.description) ? d.description[0] : (d.description || "");
      const year = String(d.date || "").match(/\d{4}/)?.[0] || "";
      const previewImage = d.identifier ? `https://archive.org/services/img/${d.identifier}` : "";
      return {
        id: `ia-${d.identifier || `${offset}-${i}`}`,
        source: "IA",
        title: Array.isArray(d.title) ? d.title[0] : (d.title || "Untitled"),
        authors: creator,
        year,
        journal: "",
        publisher: "Internet Archive",
        volume: "", issue: "", pages: "",
        doi: "",
        url: d.identifier ? `https://archive.org/details/${d.identifier}` : "",
        abstract: stripHtml(desc),
        isOA: true,
        type: "textual",
        previewImage
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};

const BDPI_ADAPTER = {
  id: "BDPI",
  name: "BDPI",
  tagline: "Biblioteca Digital del Patrimonio Iberoamericano · 16 national libraries",
  color: { bg: "bg-yellow-800", text: "text-yellow-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["latin-america", "europe"],
  archiveType: ["aggregator", "national-archive", "library"],
  contentType: ["textual", "manuscript", "visual", "primary-source"],
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    // BDPI OpenSearch — supports JSONP-style query
    const url = `https://www.iberoamericadigital.net/BDPI/OpenSearch.do?Field=todos&text=${encodeURIComponent(query)}&start=${offset}&rows=${pageSize}&format=json`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`BDPI ${r.status}`);
    const text = await r.text();
    // BDPI sometimes wraps JSON in callback; strip if needed
    const json = text.replace(/^[^{[]+/, "").replace(/[^}\]]+$/, "");
    let data;
    try { data = JSON.parse(json); } catch { throw new Error("BDPI returned non-JSON response"); }
    const items = data.items || data.docs || [];
    const total = data.totalResults || data.count || items.length;
    const results = items.map((it, i) => ({
      id: `bdpi-${it.id || `${offset}-${i}`}`,
      source: "BDPI",
      title: it.title || it.titulo || "Sin título",
      authors: Array.isArray(it.creator) ? it.creator : (it.autor ? [it.autor] : []),
      year: String(it.date || it.fecha || "").match(/\d{4}/)?.[0] || "",
      journal: "",
      publisher: it.publisher || it.institucion || "",
      volume: "", issue: "", pages: "",
      doi: "",
      url: it.link || it.url || "",
      abstract: stripHtml(it.description || it.descripcion || ""),
      isOA: true,
      type: "primary-source",
      previewImage: it.thumbnail || it.image || ""
    }));
    return { results, hasMore: offset + results.length < total };
  }
};

// ---------- ADDITIONAL EXTENSION ADAPTERS (v.10) ----------

const GALLICA_ADAPTER = {
  id: "GALLICA",
  name: "BnF Gallica",
  tagline: "Bibliothèque nationale de France · 9M+ digitized items",
  color: { bg: "bg-rose-900", text: "text-rose-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["europe", "north-africa", "mena"],
  archiveType: ["national-archive", "library", "manuscript-collection"],
  contentType: ["manuscript", "textual", "visual", "primary-source"],
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    // Gallica SRU endpoint, JSON output via &mode=json
    const url = `https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&query=${encodeURIComponent("dc.any all \"" + query + "\"")}&startRecord=${offset + 1}&maximumRecords=${pageSize}&recordSchema=dc&mode=json`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Gallica ${r.status}`);
    let data;
    try { data = await r.json(); } catch { throw new Error("Gallica returned non-JSON (CORS may be blocking)"); }
    const records = data?.srw?.records?.[0]?.record || [];
    const total = parseInt(data?.srw?.numberOfRecords?.[0] || "0", 10) || 0;
    const results = records.map((rec, i) => {
      const dc = rec?.recordData?.[0]?.["oai_dc:dc"]?.[0] || {};
      const title = (dc["dc:title"] || [""])[0] || "Untitled";
      const creators = (dc["dc:creator"] || []).filter(Boolean);
      const date = (dc["dc:date"] || [""])[0] || "";
      const desc = (dc["dc:description"] || [""])[0] || "";
      const ark = (dc["dc:identifier"] || []).find(s => typeof s === "string" && s.includes("ark:")) || "";
      return {
        id: `gallica-${ark || `${offset}-${i}`}`,
        source: "GALLICA",
        title,
        authors: creators,
        year: String(date).match(/\d{4}/)?.[0] || "",
        journal: "",
        publisher: "Bibliothèque nationale de France",
        volume: "", issue: "", pages: "",
        doi: "",
        url: ark || "",
        abstract: stripHtml(desc),
        isOA: true,
        type: "primary-source",
        previewImage: ark ? `${ark}.thumbnail` : ""
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};

const THAQALAYN_ADAPTER = {
  id: "THAQALAYN",
  name: "Thaqalayn",
  tagline: "Comprehensive Shi'i hadith library · keyless API",
  color: { bg: "bg-emerald-800", text: "text-emerald-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["mena", "south-asia"],
  archiveType: ["research-repository"],
  contentType: ["textual"],
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    // Thaqalayn returns a flat array of matches; we paginate client-side.
    const url = `https://www.thaqalayn-api.net/api/v2/query?q=${encodeURIComponent(query)}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Thaqalayn ${r.status}`);
    const data = await r.json();
    const all = Array.isArray(data) ? data : (data.hadiths || data.results || []);
    const slice = all.slice(offset, offset + pageSize);
    const results = slice.map((h, i) => {
      const englishText = h.english || h.englishText || h.text_en || "";
      const arabicText = h.arabic || h.arabicText || h.text_ar || "";
      const book = h.bookName || h.book || "";
      const chapter = h.chapterName || h.chapter || "";
      const hadithNumber = h.hadithNumber || h.id || "";
      return {
        id: `thaq-${h._id || h.id || `${offset}-${i}`}`,
        source: "THAQALAYN",
        title: book && hadithNumber ? `${book}, hadith ${hadithNumber}` : (book || "Hadith"),
        authors: [],
        year: "",
        journal: chapter,
        publisher: "Thaqalayn",
        volume: "", issue: "", pages: hadithNumber ? String(hadithNumber) : "",
        doi: "",
        url: `https://thaqalayn.net/`,
        abstract: stripHtml(englishText) || stripHtml(arabicText),
        isOA: true,
        type: "textual"
      };
    });
    return { results, hasMore: offset + slice.length < all.length };
  }
};

const NCBI_ADAPTER = {
  id: "NCBI",
  name: "NCBI Entrez",
  tagline: "Biomedical & life sciences · PubMed via E-utilities",
  color: { bg: "bg-cyan-900", text: "text-cyan-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"],
  archiveType: ["scholarly-index", "research-repository"],
  contentType: ["peer-reviewed", "textual"],
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    // E-utilities is two-step: esearch returns IDs, esummary returns metadata
    const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retstart=${offset}&retmax=${pageSize}`;
    const r1 = await fetch(esearchUrl);
    if (!r1.ok) throw new Error(`NCBI esearch ${r1.status}`);
    const searchData = await r1.json();
    const ids = searchData.esearchresult?.idlist || [];
    const total = parseInt(searchData.esearchresult?.count || "0", 10);
    if (ids.length === 0) return { results: [], hasMore: false };

    const esummaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
    const r2 = await fetch(esummaryUrl);
    if (!r2.ok) throw new Error(`NCBI esummary ${r2.status}`);
    const summaryData = await r2.json();
    const summaries = summaryData.result || {};

    const results = ids.map(id => {
      const it = summaries[id];
      if (!it) return null;
      const authors = (it.authors || []).map(a => a.name).filter(Boolean);
      const journal = it.fulljournalname || it.source || "";
      const year = String(it.pubdate || "").match(/\d{4}/)?.[0] || "";
      const doi = (it.elocationid || "").replace(/^doi:\s*/i, "") || (it.articleids || []).find(a => a.idtype === "doi")?.value || "";
      return {
        id: `ncbi-${id}`,
        source: "NCBI",
        title: it.title || "Untitled",
        authors,
        year,
        journal,
        publisher: "",
        volume: it.volume || "",
        issue: it.issue || "",
        pages: it.pages || "",
        doi,
        url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        abstract: "", // E-summary doesn't include abstract; would require efetch
        isOA: false, // PubMed indexes both OA and paywalled
        type: "article"
      };
    }).filter(Boolean);
    return { results, hasMore: offset + results.length < total };
  }
};

const OPENCONTEXT_ADAPTER = {
  id: "OPENCONTEXT",
  name: "Open Context",
  tagline: "Archaeological datasets · keyless JSON-LD",
  color: { bg: "bg-stone-600", text: "text-stone-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"],
  archiveType: ["archaeological-database"],
  contentType: ["archaeological-data", "primary-source"],
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    // Corrected endpoint: /sets/.json is the JSON-LD search API.
    // /query/.json is the human-facing UI and returns HTML. Routed through
    // proxy to inject the User-Agent OpenContext requires (browsers can't set it).
    const url = `https://opencontext.org/sets/.json?q=${encodeURIComponent(query)}&start=${offset}&rows=${pageSize}`;
    const r = await proxiedFetch(url);
    if (!r.ok) throw new Error(`Open Context ${r.status}`);
    const data = await r.json();
    const features = data.features || data.oc_api?.["has-results"] || [];
    const total = parseInt(data?.totalResults || data?.["oc-api:total"] || "0", 10) || features.length;
    const results = features.map((f, i) => {
      const props = f.properties || {};
      const label = props.label || f.label || "Untitled";
      const project = props["project label"] || props.project || "";
      const date = props.published || props["created"] || "";
      return {
        id: `oc-${props.uri || `${offset}-${i}`}`,
        source: "OPENCONTEXT",
        title: label,
        authors: [],
        year: String(date).match(/\d{4}/)?.[0] || "",
        journal: project,
        publisher: "Open Context",
        volume: "", issue: "", pages: "",
        doi: "",
        url: props.uri || "",
        abstract: stripHtml(props.description || props["dc-terms:abstract"] || ""),
        isOA: true,
        type: "archaeological-data",
        previewImage: props.thumbnail || ""
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};


// ---------- ADDITIONAL EXTENSION ADAPTERS (v.11) ----------

const NORTHWESTERN_ADAPTER = {
  id: "NORTHWESTERN",
  name: "Northwestern Digital",
  tagline: "Herskovits Library · Hausa/Fulani Ajami, West African Arabic-script MSS",
  color: { bg: "bg-purple-900", text: "text-purple-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["west-africa", "sahel", "global"],
  archiveType: ["library", "manuscript-collection"],
  contentType: ["manuscript", "primary-source", "visual"],
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    // NULIB v2 API uses POST with OpenSearch DSL.
    // Pattern 3: try direct first (CORS unverified), fall back to proxy on network failure.
    const nuUrl = "https://api.dc.library.northwestern.edu/api/v2/search";
    let r;
    try {
      r = await fetch(nuUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body)
      });
    } catch {
      r = await proxiedFetch(nuUrl, { method: "POST", body: JSON.stringify(body) });
    }
    if (!r.ok) throw new Error(`Northwestern ${r.status}`);
    const data = await r.json();
    const docs = data.data || [];
    const total = data.info?.total || data.pagination?.total_results || docs.length;
    const results = docs.map((d, i) => {
      const creators = (d.creator || []).map(c => c.label || c).filter(Boolean);
      const dateStr = d.date_created?.[0]?.label || d.create_date || "";
      return {
        id: `nu-${d.id || `${offset}-${i}`}`,
        source: "NORTHWESTERN",
        title: d.title || "Untitled",
        authors: creators,
        year: String(dateStr).match(/\d{4}/)?.[0] || "",
        journal: "",
        publisher: "Northwestern University Library",
        volume: "", issue: "", pages: "",
        doi: "",
        url: d.canonical_link || `https://dc.library.northwestern.edu/items/${d.id}`,
        abstract: stripHtml(Array.isArray(d.description) ? d.description[0] : (d.description || "")),
        isOA: true,
        type: "manuscript",
        previewImage: d.thumbnail || (d.representative_file_set?.url ? `${d.representative_file_set.url}/full/300,/0/default.jpg` : "")
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};

const PRINCETON_DPUL_ADAPTER = {
  id: "PRINCETON_DPUL",
  name: "Princeton DPUL",
  tagline: "Digital PUL · Islamic, Persian Sufi & Shi'i manuscripts",
  color: { bg: "bg-orange-800", text: "text-orange-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["mena", "south-asia", "global"],
  archiveType: ["manuscript-collection", "library"],
  contentType: ["manuscript", "textual", "primary-source"],
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    const page = Math.floor(offset / pageSize) + 1;
    // DPUL is Spotlight-on-Blacklight. Princeton's deployment has no CORS headers.
    // "Failed to fetch" with no status = browser CORS rejection. Proxy fixes it.
    const url = `https://dpul.princeton.edu/catalog.json?q=${encodeURIComponent(query)}&per_page=${pageSize}&page=${page}`;
    const r = await proxiedFetch(url);
    if (!r.ok) throw new Error(`Princeton DPUL ${r.status}`);
    const data = await r.json();
    const docs = data.data || data.response?.docs || [];
    const total = data.meta?.pages?.total_count || data.response?.numFound || docs.length;
    // Blacklight JSON-API nests fields as attributes.<field>.attributes.value
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
        id: `dpul-${d.id || `${offset}-${i}`}`,
        source: "PRINCETON_DPUL",
        title: typeof title === "string" ? title : (Array.isArray(title) ? title.join(", ") : "Untitled"),
        authors: author ? [String(author)] : [],
        year: String(dateRaw).match(/\d{4}/)?.[0] || "",
        journal: "",
        publisher: "Princeton University Library",
        volume: "", issue: "", pages: "",
        doi: "",
        url: d.links?.self || `https://dpul.princeton.edu/catalog/${d.id}`,
        abstract: stripHtml(getAttr(d, "description_tsim") || getAttr(d, "summary")),
        isOA: true,
        type: "manuscript"
      };
    });
    return { results, hasMore: offset + results.length < total };
  }
};

// PANGAEA — Earth & environment data publisher. Uses internal panFMP Elasticsearch schema.
// Field names differ from standard ES conventions — verified against rOpenSci pangaear docs.
// Routed through proxy (CORS-blocked in browsers + POST body forwarding needed).
const PANGAEA_ADAPTER = {
  id: "PANGAEA",
  name: "PANGAEA",
  tagline: "Earth & environment data · archaeogenetic metadata",
  color: { bg: "bg-teal-900", text: "text-teal-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"],
  archiveType: ["genomic-database", "archaeological-database", "research-repository"],
  contentType: ["genomic-data", "structured-data", "primary-source"],
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    // Request only the panFMP fields we actually map below — avoids large xml blob in response.
    const body = {
      query: { query_string: { query } },
      size: pageSize,
      from: offset,
      _source: ["sf-authortitle", "agg-author", "agg-pubYear", "URI", "abstract"]
    };
    const r = await proxiedFetch("https://ws.pangaea.de/es/pangaea/panmd/_search", {
      method: "POST",
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`PANGAEA ${r.status}`);
    const data = await r.json();
    const hits = data.hits?.hits || [];
    const total = data.hits?.total?.value ?? data.hits?.total ?? hits.length;
    const results = hits.map((h, i) => {
      const s = h._source || {};
      // sf-authortitle is PANGAEA's combined citation string, e.g.:
      // "Schiebel R, Waniek J (2001): Physical oceanography during METEOR cruise M36/6"
      // Shown as-is — always correct, genuinely useful for copy-paste citation.
      const title = s["sf-authortitle"] || "Untitled";
      const authors = (s["agg-author"] || []).filter(Boolean);
      const year = s["agg-pubYear"] ? String(s["agg-pubYear"]) : "";
      const url = s.URI || "";
      const doi = (s.URI || "").match(/10\.\d+\/[^\s]+$/)?.[0] || "";
      return {
        id: `pangaea-${h._id || `${offset}-${i}`}`,
        source: "PANGAEA",
        title,
        authors,
        year,
        journal: "",
        publisher: "PANGAEA",
        volume: "", issue: "", pages: "",
        doi,
        url: url || (doi ? `https://doi.org/${doi}` : ""),
        abstract: stripHtml(s.abstract || ""),
        isOA: true,
        type: "genomic-data"
      };
    });
    return { results, hasMore: offset + hits.length < total };
  }
};

// OpenNeuro — GraphQL adapter. The schema doesn't expose a server-side
// text-search filter on `datasets`, so we fetch a recent batch and filter
// client-side. This is approximate but works for the typical use case
// (low-volume specialty queries).
const OPENNEURO_ADAPTER = {
  id: "OPENNEURO",
  name: "OpenNeuro",
  tagline: "BIDS neuroimaging datasets · client-side filtered text match",
  color: { bg: "bg-violet-900", text: "text-violet-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"],
  archiveType: ["research-repository"],
  contentType: ["structured-data", "primary-source"],
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    // GraphQL fetch of recent public datasets, then client-side text match.
    const gqlQuery = `
      query PublicDatasets {
        datasets(first: 100, orderBy: { created: descending }) {
          edges {
            node {
              id
              created
              latestSnapshot {
                tag
                description {
                  Name
                  Authors
                  DatasetDOI
                  Acknowledgements
                }
                summary {
                  modalities
                  tasks
                }
              }
            }
          }
        }
      }
    `;
    // Pattern 3: try direct first, fall back to proxy on network/CORS failure.
    const onUrl = "https://openneuro.org/crn/graphql";
    let r;
    try {
      r = await fetch(onUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: gqlQuery })
      });
    } catch {
      r = await proxiedFetch(onUrl, { method: "POST", body: JSON.stringify({ query: gqlQuery }) });
    }
    if (!r.ok) throw new Error(`OpenNeuro ${r.status}`);
    const data = await r.json();
    if (data.errors) throw new Error(`OpenNeuro GraphQL: ${data.errors[0]?.message || "unknown error"}`);
    const allDatasets = (data.data?.datasets?.edges || []).map(e => e.node);
    // Client-side text filter against name + authors + tasks + modalities
    const q = query.toLowerCase();
    const matched = allDatasets.filter(ds => {
      const desc = ds.latestSnapshot?.description || {};
      const summary = ds.latestSnapshot?.summary || {};
      const haystack = [
        desc.Name || "",
        (desc.Authors || []).join(" "),
        desc.Acknowledgements || "",
        (summary.tasks || []).join(" "),
        (summary.modalities || []).join(" ")
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
    const slice = matched.slice(offset, offset + pageSize);
    const results = slice.map((ds, i) => {
      const desc = ds.latestSnapshot?.description || {};
      const summary = ds.latestSnapshot?.summary || {};
      return {
        id: `on-${ds.id}-${i}`,
        source: "OPENNEURO",
        title: desc.Name || ds.id,
        authors: desc.Authors || [],
        year: String(ds.created || "").match(/\d{4}/)?.[0] || "",
        journal: (summary.modalities || []).join(", "),
        publisher: "OpenNeuro",
        volume: "", issue: "", pages: "",
        doi: desc.DatasetDOI || "",
        url: `https://openneuro.org/datasets/${ds.id}`,
        abstract: desc.Acknowledgements || `Tasks: ${(summary.tasks || []).join(", ")}`,
        isOA: true,
        type: "structured-data"
      };
    });
    return { results, hasMore: offset + slice.length < matched.length };
  }
};

// ENA — European Nucleotide Archive. REST/JSON portal API per v.10 deferred-work plan.
const ENA_ADAPTER = {
  id: "ENA",
  name: "ENA",
  tagline: "European Nucleotide Archive · ancient DNA, genomic studies",
  color: { bg: "bg-cyan-800", text: "text-cyan-50" },
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"],
  archiveType: ["genomic-database"],
  contentType: ["genomic-data"],
  needsKey: false,
  search: async (query, settings, opts = {}) => {
    const offset = opts.offset || 0;
    const pageSize = offset === 0 ? 3 : 5;
    // ENA portal API — search studies; fields tuned for citation context.
    const fields = "study_accession,study_title,study_description,first_public,center_name,study_alias";
    // ENA's `query` accepts Lucene-ish syntax; we wrap user input in a free-text match across all fields.
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
      id: `ena-${it.study_accession || `${offset}-${i}`}`,
      source: "ENA",
      title: it.study_title || it.study_alias || "Untitled study",
      authors: it.center_name ? [it.center_name] : [],
      year: String(it.first_public || "").slice(0, 4),
      journal: it.study_accession || "",
      publisher: "European Nucleotide Archive",
      volume: "", issue: "", pages: "",
      doi: "",
      url: it.study_accession ? `https://www.ebi.ac.uk/ena/browser/view/${it.study_accession}` : "",
      abstract: stripHtml(it.study_description || ""),
      isOA: true,
      type: "genomic-data"
    }));
    // ENA portal API doesn't return total count directly; assume more if we got a full page.
    const hasMore = items.length === pageSize;
    return { results, hasMore };
  }
};


// Same shape as adapters minus the search function — render as launcher buttons,
// grouped by region in their own collapsible block.
// ---------- LAUNCHER FACTORY ----------
// SSOT for launcher object shape. Pass a config, get a launcher.
// id, name, region, archiveType, contentType, buildUrl are required.
// tagline is optional but recommended.
const createLauncher = (cfg) => ({
  id: cfg.id,
  name: cfg.name,
  tagline: cfg.tagline || "",
  region: cfg.region,
  archiveType: cfg.archiveType,
  contentType: cfg.contentType,
  buildUrl: cfg.buildUrl
});

const LAUNCHERS = [
  // === Pre-existing launchers (preserved) ===
  createLauncher({
    id: "JSTOR",
    name: "JSTOR",
    tagline: "Use your own JSTOR account",
    region: ["global"],
    archiveType: ["scholarly-index", "aggregator"],
    contentType: ["peer-reviewed", "textual"],
    buildUrl: (q) => `https://www.jstor.org/action/doBasicSearch?Query=${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "QDL",
    name: "Qatar Digital Library",
    tagline: "Arabic, Persian & Gulf manuscripts · IIIF imaging",
    region: ["mena"],
    archiveType: ["library", "manuscript-collection"],
    contentType: ["manuscript", "visual", "primary-source"],
    buildUrl: (q) => `https://www.qdl.qa/en/search/site/${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "OPENITI",
    name: "OpenITI",
    tagline: "Machine-readable Islamicate texts (Arabic/Persian/Turkish/Urdu) · classical Sufi corpus",
    region: ["mena", "south-asia", "central-asia"],
    archiveType: ["research-repository"],
    contentType: ["textual", "manuscript", "structured-data"],
    buildUrl: () => `https://github.com/OpenITI`
  }),
  createLauncher({
    id: "ALFURQAN",
    name: "Al-Furqan",
    tagline: "Islamic heritage manuscript catalog",
    region: ["mena"],
    archiveType: ["manuscript-collection"],
    contentType: ["manuscript", "textual"],
    buildUrl: (q) => `https://al-furqan.com/?s=${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "SHIA_API",
    name: "ShiaAPI",
    tagline: "Shi'i devotional corpus · gated, requires RapidAPI subscription",
    region: ["mena"],
    archiveType: ["research-repository"],
    contentType: ["textual"],
    buildUrl: () => `https://rapidapi.com/search/shia`
  }),
  createLauncher({
    id: "SALT",
    name: "SALT Research",
    tagline: "Istanbul · Bektashi, Mevlevi, Halveti & Sufi archives",
    region: ["mena"],
    archiveType: ["research-repository", "audiovisual-archive"],
    contentType: ["visual", "primary-source", "manuscript"],
    buildUrl: (q) => `https://archives.saltresearch.org/discover?query=${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "IRI",
    name: "Istanbul Research Institute",
    tagline: "Ottoman Sufi manuscripts & Istanbul history",
    region: ["mena"],
    archiveType: ["research-repository", "manuscript-collection"],
    contentType: ["primary-source", "manuscript", "visual"],
    buildUrl: (q) => `https://digital.iae.org.tr/?q=${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "PRINCETON_ISLAMIC",
    name: "Princeton Islamic Manuscripts",
    tagline: "Persian Sufi · Shi'i · broader Islamic manuscript holdings",
    region: ["mena", "south-asia"],
    archiveType: ["manuscript-collection"],
    contentType: ["manuscript"],
    buildUrl: (q) => `https://dpul.princeton.edu/islamicmss?q=${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "BL",
    name: "British Library",
    tagline: "UK national library catalog · Ottoman Sufi manuscripts",
    region: ["europe", "global", "mena"],
    archiveType: ["national-archive", "library", "manuscript-collection"],
    contentType: ["manuscript", "textual", "primary-source"],
    buildUrl: (q) => `https://explore.bl.uk/primo_library/libweb/action/search.do?vid=BLVU1&fn=search&query=any%2Ccontains%2C${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "EAP",
    name: "Endangered Archives (EAP)",
    tagline: "British Library EAP · Maghreb, Sahel, South Asia, MENA at-risk collections",
    region: ["global", "north-africa", "sahel", "west-africa", "sub-saharan-africa", "south-asia", "mena"],
    archiveType: ["manuscript-collection", "audiovisual-archive"],
    contentType: ["manuscript", "primary-source", "audio", "visual"],
    buildUrl: (q) => `https://eap.bl.uk/search/site/${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "SAOA",
    name: "South Asia Open Archives",
    tagline: "Sufi periodicals, Urdu/Persian texts · CRL",
    region: ["south-asia"],
    archiveType: ["aggregator", "research-repository"],
    contentType: ["textual", "primary-source", "ephemera"],
    buildUrl: (q) => `https://www.jstor.org/site/saoa/?searchText=${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "HMML",
    name: "HMML",
    tagline: "Hill MS Library · Timbuktu, Mauritania, Maghreb · 486K MSS",
    region: ["global", "mena", "north-africa", "europe", "sub-saharan-africa"],
    archiveType: ["manuscript-collection"],
    contentType: ["manuscript", "primary-source"],
    buildUrl: (q) => `https://www.vhmml.org/readingRoom/search?keywords=${encodeURIComponent(q)}`
  }),

  // === New launchers from baazijan's table ===
  createLauncher({
    id: "BNF_GALLICA",
    name: "BnF Gallica",
    tagline: "Bibliothèque nationale de France · Maghrebi & global manuscripts",
    region: ["europe", "north-africa", "mena"],
    archiveType: ["national-archive", "library", "manuscript-collection"],
    contentType: ["manuscript", "textual", "visual", "primary-source"],
    buildUrl: (q) => `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&query=${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "IRAN_NATLIB",
    name: "Iran National Library",
    tagline: "Persian Sufi manuscripts · authentication may be required",
    region: ["mena"],
    archiveType: ["national-archive", "manuscript-collection"],
    contentType: ["manuscript", "textual"],
    buildUrl: () => `https://www.nlai.ir/`
  }),
  createLauncher({
    id: "UZBEKISTAN_NATLIB",
    name: "Uzbekistan National Library",
    tagline: "Turkic Sufi manuscripts · IIIF",
    region: ["central-asia"],
    archiveType: ["national-archive", "manuscript-collection"],
    contentType: ["manuscript"],
    buildUrl: () => `https://www.natlib.uz/`
  }),
  createLauncher({
    id: "KAZAKHSTAN_DIGLIB",
    name: "Kazakhstan Digital Library",
    tagline: "Yasawi & Turkic Sufi manuscripts",
    region: ["central-asia"],
    archiveType: ["national-archive", "manuscript-collection"],
    contentType: ["manuscript"],
    buildUrl: () => `https://kitap.kz/`
  }),
  createLauncher({
    id: "USUL_DATA",
    name: "Usul Data",
    tagline: "Islamic texts metadata · GitHub static dataset",
    region: ["global", "mena"],
    archiveType: ["research-repository"],
    contentType: ["structured-data", "textual"],
    buildUrl: () => `https://github.com/usul-data`
  }),
  // Vienna museums (verified: no public search API)
  createLauncher({
    id: "KHM_WIEN",
    name: "Kunsthistorisches Wien",
    tagline: "Vienna · Habsburg art collections · Sammlung Online",
    region: ["europe"],
    archiveType: ["museum"],
    contentType: ["visual", "primary-source"],
    buildUrl: (q) => `https://www.khm.at/objektdb/?wer=${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "NHM_WIEN",
    name: "Naturhistorisches Wien",
    tagline: "Vienna · natural history collections · Data Repository",
    region: ["europe"],
    archiveType: ["museum", "research-repository"],
    contentType: ["primary-source", "structured-data", "3d"],
    buildUrl: (q) => `https://datarepository.nhm.at/?q=${encodeURIComponent(q)}`
  }),
  // Sciences-side launchers (gated/specialty)
  createLauncher({
    id: "TDAR",
    name: "tDAR",
    tagline: "Digital Archaeological Record · auth-walled API · web search free",
    region: ["global"],
    archiveType: ["archaeological-database"],
    contentType: ["archaeological-data", "textual"],
    buildUrl: (q) => `https://core.tdar.org/search/results?query=${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "ARIADNEPLUS",
    name: "ARIADNEplus",
    tagline: "European archaeology infrastructure · SPARQL backend",
    region: ["europe"],
    archiveType: ["archaeological-database", "sparql-endpoint"],
    contentType: ["archaeological-data"],
    buildUrl: (q) => `https://portal.ariadne-infrastructure.eu/search?q=${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "BRITISH_MUSEUM",
    name: "British Museum",
    tagline: "British Museum collection · 8M+ artifacts · SPARQL backend",
    region: ["europe", "global"],
    archiveType: ["museum"],
    contentType: ["primary-source", "visual"],
    buildUrl: (q) => `https://www.britishmuseum.org/collection/search?keyword=${encodeURIComponent(q)}`
  }),
  createLauncher({
    id: "HRAF",
    name: "HRAF",
    tagline: "Human Relations Area Files · ethnographic datasets · subscription-walled",
    region: ["global"],
    archiveType: ["ethnographic-database"],
    contentType: ["ethnographic-data", "textual"],
    buildUrl: (q) => `https://ehrafworldcultures.yale.edu/search?q=${encodeURIComponent(q)}`
  })
];

const ADAPTER_CATEGORY_DEFAULT_ENABLED = (a) => a.category === ADAPTER_CATEGORY.CORE;

// Adapter registry — order here is render order in results.
// Core (always on, cannot be disabled): foundational scholarly indexes.
// Extensions (opt-in): everything else. Listed here once, runtime filters by isAdapterEnabled.
const ADAPTERS = [
  // Core
  DOAJ_ADAPTER, OPENALEX_ADAPTER, CROSSREF_ADAPTER, CURATED_JOURNALS_ADAPTER,
  // Extensions — scholarly
  SEMANTIC_SCHOLAR_ADAPTER,
  // Extensions — cultural & primary sources
  EUROPEANA_ADAPTER, MET_ADAPTER, SMITHSONIAN_ADAPTER, DPLA_ADAPTER,
  RIJKSMUSEUM_ADAPTER, INTERNET_ARCHIVE_ADAPTER, BDPI_ADAPTER,
  // Extensions — sciences (added v.10)
  NCBI_ADAPTER, OPENCONTEXT_ADAPTER,
  // Extensions — Islamicate / heritage (added v.10)
  GALLICA_ADAPTER, THAQALAYN_ADAPTER,
  // Extensions — added v.11
  NORTHWESTERN_ADAPTER, PRINCETON_DPUL_ADAPTER, PANGAEA_ADAPTER, OPENNEURO_ADAPTER, ENA_ADAPTER
];


// ---------- Citation formatters ----------

const swapNameLastFirst = (name) => {
  const parts = (name || "").trim().split(/\s+/);
  if (parts.length < 2) return name || "";
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(" ");
  return `${last}, ${rest}`;
};

const initializeName = (name) => {
  const parts = (name || "").trim().split(/\s+/);
  if (parts.length < 2) return name || "";
  const last = parts[parts.length - 1];
  const initials = parts.slice(0, -1).map(p => p[0] ? p[0].toUpperCase() + "." : "").join(" ");
  return `${last}, ${initials}`;
};

const mlaAuthors = (authors) => {
  const names = (authors || []).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return `${swapNameLastFirst(names[0])}.`;
  if (names.length === 2) return `${swapNameLastFirst(names[0])}, and ${names[1]}.`;
  if (names.length === 3) return `${swapNameLastFirst(names[0])}, ${names[1]}, and ${names[2]}.`;
  return `${swapNameLastFirst(names[0])}, et al.`;
};

const apaAuthors = (authors) => {
  const names = (authors || []).filter(Boolean).map(initializeName);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length <= 20) return names.slice(0, -1).join(", ") + ", & " + names[names.length - 1];
  return names.slice(0, 19).join(", ") + ", ... " + names[names.length - 1];
};

// Returns array of segments: [{text, italic?}]
const buildMLA = (r) => {
  if (r.type === "primary-source") {
    const segs = [];
    if (r.title) segs.push({ text: `"${r.title}." ` });
    if (r.year) segs.push({ text: `${r.year}. ` });
    if (r.publisher) segs.push({ text: r.publisher + ". " });
    if (r.url) segs.push({ text: r.url });
    return segs;
  }
  const segs = [];
  const auth = mlaAuthors(r.authors);
  if (auth) segs.push({ text: auth + " " });
  if (r.title) segs.push({ text: `"${r.title}." ` });
  if (r.journal) segs.push({ text: r.journal, italic: true });
  const tail = [];
  if (r.volume) tail.push(`vol. ${r.volume}`);
  if (r.issue) tail.push(`no. ${r.issue}`);
  if (r.year) tail.push(r.year);
  if (r.pages) tail.push(`pp. ${r.pages}`);
  if (r.url) tail.push(r.url);
  if (tail.length) segs.push({ text: ", " + tail.join(", ") + "." });
  else if (r.journal) segs.push({ text: "." });
  return segs;
};

const buildAPA = (r) => {
  if (r.type === "primary-source") {
    const segs = [];
    if (r.authors?.length) segs.push({ text: apaAuthors(r.authors) + " " });
    segs.push({ text: `(${r.year || "n.d."}). ` });
    if (r.title) segs.push({ text: r.title, italic: true });
    segs.push({ text: ". " });
    if (r.publisher) segs.push({ text: r.publisher + ". " });
    if (r.url) segs.push({ text: r.url });
    return segs;
  }
  const segs = [];
  const auth = apaAuthors(r.authors);
  if (auth) segs.push({ text: auth + " " });
  segs.push({ text: `(${r.year || "n.d."}). ` });
  if (r.title) segs.push({ text: r.title + ". " });
  if (r.journal) segs.push({ text: r.journal, italic: true });
  if (r.volume) {
    segs.push({ text: ", " });
    segs.push({ text: r.volume, italic: true });
    if (r.issue) segs.push({ text: `(${r.issue})` });
  }
  if (r.pages) segs.push({ text: `, ${r.pages}` });
  segs.push({ text: ". " });
  if (r.url) segs.push({ text: r.url });
  return segs;
};

const segmentsToPlain = (segs) => segs.map(s => s.text).join("").replace(/\s+/g, " ").trim();

// ---------- Component ----------

export default function ScholarlySearch() {
  const [query, setQuery] = useState("");
  const [sectionStates, setSectionStates] = useState({});
  // sectionStates[adapterId] = { loading, results, error }
  const [hasSearched, setHasSearched] = useState(false);
  const [copied, setCopied] = useState({ id: null, style: null });
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    europeanaKey: "", openAlexKey: "", crossrefEmail: "", s2Key: "",
    smithsonianKey: "", dplaKey: "", rijksKey: "",
    curatedJournals: DEFAULT_CURATED_JOURNALS,
    enabledSources: {} // adapter.id -> bool; missing key = use default (core on, ext off)
  });
  const [themeKey, setThemeKey] = useState(DEFAULT_THEME);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [libraryItems, setLibraryItems] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const inputRef = useRef(null);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const eu = localStorage.getItem("europeanaKey") || "";
      const openAlexKey = localStorage.getItem("openAlexKey") || "";
      // Backward-compat: migrate the old openAlexEmail field to crossrefEmail.
      // OpenAlex no longer accepts mailto (Feb 2026), but Crossref still does,
      // so the saved email retains value if we route it there.
      const legacyEmail = localStorage.getItem("openAlexEmail") || "";
      const crossrefEmail = localStorage.getItem("crossrefEmail") || legacyEmail || "";
      if (legacyEmail && !localStorage.getItem("crossrefEmail")) {
        try {
          localStorage.setItem("crossrefEmail", legacyEmail);
          localStorage.removeItem("openAlexEmail");
        } catch {}
      }
      const s2 = localStorage.getItem("s2Key") || "";
      const smithsonianKey = localStorage.getItem("smithsonianKey") || "";
      const dplaKey = localStorage.getItem("dplaKey") || "";
      const rijksKey = localStorage.getItem("rijksKey") || "";
      const enabledRaw = localStorage.getItem("enabledSources");
      let enabledSources = {};
      if (enabledRaw) {
        try {
          const obj = JSON.parse(enabledRaw);
          if (obj && typeof obj === "object") enabledSources = obj;
        } catch {}
      }
      const cjRaw = localStorage.getItem("curatedJournals");
      const savedTheme = localStorage.getItem("themeKey");
      let parsedJournals = DEFAULT_CURATED_JOURNALS;
      if (cjRaw) {
        try {
          const arr = JSON.parse(cjRaw);
          if (Array.isArray(arr)) parsedJournals = arr;
        } catch {}
      }
      setSettings({
        europeanaKey: eu,
        openAlexKey,
        crossrefEmail,
        s2Key: s2,
        smithsonianKey, dplaKey, rijksKey,
        curatedJournals: parsedJournals,
        enabledSources
      });
      if (savedTheme && THEMES[savedTheme]) setThemeKey(savedTheme);
      setHistoryEntries(history.load());
      setLibraryItems(library.load());
    } catch {}
    setSettingsLoaded(true);
    inputRef.current?.focus();
  }, []);

  const saveSettings = (newSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem("europeanaKey", newSettings.europeanaKey || "");
      localStorage.setItem("openAlexKey", newSettings.openAlexKey || "");
      localStorage.setItem("crossrefEmail", newSettings.crossrefEmail || "");
      localStorage.setItem("s2Key", newSettings.s2Key || "");
      localStorage.setItem("smithsonianKey", newSettings.smithsonianKey || "");
      localStorage.setItem("dplaKey", newSettings.dplaKey || "");
      localStorage.setItem("rijksKey", newSettings.rijksKey || "");
      localStorage.setItem("curatedJournals", JSON.stringify(newSettings.curatedJournals || []));
      localStorage.setItem("enabledSources", JSON.stringify(newSettings.enabledSources || {}));
    } catch {}
  };

  // Helper: is this adapter currently enabled?
  const isAdapterEnabled = (adapter) => {
    const override = settings.enabledSources?.[adapter.id];
    if (typeof override === "boolean") return override;
    return ADAPTER_CATEGORY_DEFAULT_ENABLED(adapter);
  };

  const toggleAdapter = (adapterId) => {
    const adapter = ADAPTERS.find(a => a.id === adapterId);
    if (!adapter) return;
    // Core adapters can't be disabled — guard rail
    if (adapter.category === ADAPTER_CATEGORY.CORE) return;
    const current = isAdapterEnabled(adapter);
    saveSettings({
      ...settings,
      enabledSources: { ...settings.enabledSources, [adapterId]: !current }
    });
  };

  const changeTheme = (newKey) => {
    if (!THEMES[newKey]) return;
    setThemeKey(newKey);
    try { localStorage.setItem("themeKey", newKey); } catch {}
  };

  const theme = THEMES[themeKey] || THEMES[DEFAULT_THEME];

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setHasSearched(true);
    setHistoryEntries(history.add(query));

    // Determine which adapters to actually run (core always, extensions per setting)
    const activeAdapters = ADAPTERS.filter(isAdapterEnabled);

    // Initialize sections only for active adapters
    const initialStates = {};
    activeAdapters.forEach(a => {
      initialStates[a.id] = {
        loading: true, results: null, error: null,
        hasMore: false, loadingMore: false, offset: 0
      };
    });
    setSectionStates(initialStates);

    // Fire all active adapters in parallel; update each as it returns
    activeAdapters.forEach(async (adapter) => {
      try {
        const response = await adapter.search(query, settings, { offset: 0 });
        const results = Array.isArray(response) ? response : (response.results || []);
        const hasMore = Array.isArray(response) ? false : !!response.hasMore;
        setSectionStates(prev => ({
          ...prev,
          [adapter.id]: {
            loading: false, results, error: null,
            hasMore, loadingMore: false, offset: results.length
          }
        }));
      } catch (err) {
        setSectionStates(prev => ({
          ...prev,
          [adapter.id]: {
            loading: false, results: null, error: err.message || "Search failed",
            hasMore: false, loadingMore: false, offset: 0
          }
        }));
      }
    });
  }, [query, settings]);

  const handleLoadMore = useCallback(async (adapterId) => {
    const adapter = ADAPTERS.find(a => a.id === adapterId);
    if (!adapter) return;
    const current = sectionStates[adapterId];
    if (!current || current.loadingMore || !current.hasMore) return;

    setSectionStates(prev => ({
      ...prev,
      [adapterId]: { ...prev[adapterId], loadingMore: true }
    }));

    try {
      const response = await adapter.search(query, settings, { offset: current.offset });
      const newResults = Array.isArray(response) ? response : (response.results || []);
      const hasMore = Array.isArray(response) ? false : !!response.hasMore;
      setSectionStates(prev => {
        const existing = prev[adapterId];
        const combined = [...(existing.results || []), ...newResults];
        return {
          ...prev,
          [adapterId]: {
            ...existing,
            results: combined,
            hasMore,
            loadingMore: false,
            offset: combined.length
          }
        };
      });
    } catch (err) {
      setSectionStates(prev => ({
        ...prev,
        [adapterId]: {
          ...prev[adapterId],
          loadingMore: false,
          error: err.message || "Couldn't load more"
        }
      }));
    }
  }, [query, settings, sectionStates]);

  const copyText = (text, id, style) => {
    navigator.clipboard.writeText(text);
    setCopied({ id, style });
    setTimeout(() => setCopied({ id: null, style: null }), 1500);
  };

  const isInLibrary = (result) => libraryItems.some(item => libraryKey(item) === libraryKey(result));

  const toggleLibrary = (result) => {
    if (isInLibrary(result)) {
      setLibraryItems(library.remove(result));
    } else {
      setLibraryItems(library.add(result));
    }
  };

  const exportLibraryAsBibliography = () => {
    if (libraryItems.length === 0) return;
    const lines = [];
    lines.push("OPENCITE LIBRARY EXPORT");
    lines.push(`Generated ${new Date().toLocaleString()}`);
    lines.push(`${libraryItems.length} item${libraryItems.length !== 1 ? "s" : ""}`);
    lines.push("");
    lines.push("=== MLA 9 ===");
    lines.push("");
    libraryItems.forEach(item => {
      lines.push(segmentsToPlain(buildMLA(item)));
      lines.push("");
    });
    lines.push("");
    lines.push("=== APA 7 ===");
    lines.push("");
    libraryItems.forEach(item => {
      lines.push(segmentsToPlain(buildAPA(item)));
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opencite-library-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // (External launchers handle their own URL building)

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: theme.bg,
        fontFamily: "'Avenir Next', 'Avenir', 'Mulish', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        color: theme.fg,
        "--ui-fg": theme.fg,
        "--ui-fg-muted": theme.fgMuted,
        "--ui-fg-subtle": theme.fgSubtle,
        "--ui-border": theme.border,
        "--ui-border-subtle": theme.borderSubtle,
        "--ui-surface": theme.surface,
        "--ui-accent": theme.accent,
        "--ui-on-accent": theme.onAccent,
        "--ui-button-bg": theme.buttonBg,
        "--ui-settings-bg": theme.settingsBg,
        "--ui-input-bg": theme.inputBg,
        "--ui-grain-opacity": theme.grainOpacity
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Mulish:ital,wght@0,300..1000;1,300..1000&family=JetBrains+Mono:wght@400;500&display=swap');
        .display-font { font-family: 'Avenir Next', 'Avenir', 'Mulish', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
        .mono-font { font-family: 'JetBrains Mono', monospace; }
        .grain::before {
          content: ''; position: fixed; inset: 0; pointer-events: none;
          opacity: var(--ui-grain-opacity, 0.04); z-index: 1;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }
        .fade-in { animation: fade 0.5s ease-out; }
        @keyframes fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .underline-thick { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
        .pulse-dot { animation: pulse 1.4s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
      `}</style>
      <div className="grain"></div>

      <div className="relative max-w-4xl mx-auto px-6 py-10 md:py-16" style={{ zIndex: 2 }}>
        {/* Header */}
        <header className="mb-10 md:mb-14">
          <div className="flex items-baseline justify-between mb-2">
            <span className="mono-font text-xs uppercase tracking-[0.3em] text-stone-600">v.11 / opencite</span>
            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={() => { setShowLibrary(!showLibrary); setShowHistory(false); setShowSettings(false); }}
                className="mono-font text-xs uppercase tracking-widest text-stone-600 hover:text-red-900 transition"
              >
                ★ library{libraryItems.length > 0 ? ` (${libraryItems.length})` : ""}
              </button>
              <button
                onClick={() => { setShowHistory(!showHistory); setShowLibrary(false); setShowSettings(false); }}
                className="mono-font text-xs uppercase tracking-widest text-stone-600 hover:text-red-900 transition"
              >
                ↻ history{historyEntries.length > 0 ? ` (${historyEntries.length})` : ""}
              </button>
              <button
                onClick={() => { setShowSettings(!showSettings); setShowHistory(false); setShowLibrary(false); }}
                className="mono-font text-xs uppercase tracking-widest text-stone-600 hover:text-red-900 transition"
              >
                ⚙ settings
              </button>
            </div>
          </div>
          <div className="border-t-2 border-stone-900 pt-6">
            <h1 className="display-font text-5xl md:text-7xl font-black leading-none text-stone-900 mb-3" style={{ letterSpacing: "-0.02em" }}>
              OpenCITE
            </h1>
            <p className="display-font italic text-lg md:text-xl text-stone-700 max-w-xl mb-3">
              A meta-search across free, open-access scholarly databases. Citations ready to paste.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              {ADAPTERS.map(a => (
                <span key={a.id} className={`mono-font text-[10px] uppercase tracking-widest ${a.color.bg} ${a.color.text} px-2 py-1`}>
                  {a.name}
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* Settings panel */}
        {/* History panel */}
        {/* Library panel */}
        {showLibrary && (
          <section className="fade-in mb-8 border-2 border-stone-900 bg-amber-50 p-5">
            <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
              <h2 className="mono-font text-xs uppercase tracking-widest text-stone-700">
                Saved library {libraryItems.length > 0 && `· ${libraryItems.length} item${libraryItems.length !== 1 ? "s" : ""}`}
              </h2>
              {libraryItems.length > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={exportLibraryAsBibliography}
                    className="mono-font text-[10px] uppercase tracking-widest text-stone-700 hover:text-red-900 transition"
                  >
                    ↓ Export bibliography
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove all ${libraryItems.length} items from your library?`)) {
                        setLibraryItems(library.clear());
                      }
                    }}
                    className="mono-font text-[10px] uppercase tracking-widest text-stone-600 hover:text-red-900 transition"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
            {libraryItems.length === 0 ? (
              <div className="py-3">
                <p className="display-font italic text-stone-700 mb-1">No saved items yet.</p>
                <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600">
                  Tap the ☆ on any result to save it. Your library persists across sessions.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {libraryItems.map((item, i) => (
                  <ResultCard
                    key={libraryKey(item)}
                    result={item}
                    index={i}
                    onCopy={copyText}
                    copied={copied}
                    isInLibrary={true}
                    onToggleLibrary={toggleLibrary}
                  />
                ))}
              </div>
            )}
            <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 pt-3 mt-3 border-t border-stone-300">
              Stored locally · click ★ on any item to remove · export creates a .txt with MLA + APA
            </p>
          </section>
        )}

        {showHistory && (
          <section className="fade-in mb-8 border-2 border-stone-900 bg-amber-50 p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="mono-font text-xs uppercase tracking-widest text-stone-700">Recent searches</h2>
              {historyEntries.length > 0 && (
                <button
                  onClick={() => setHistoryEntries(history.clear())}
                  className="mono-font text-[10px] uppercase tracking-widest text-stone-600 hover:text-red-900 transition"
                >
                  Clear all
                </button>
              )}
            </div>
            {historyEntries.length === 0 ? (
              <p className="display-font italic text-sm text-stone-600">No searches yet — your history will appear here.</p>
            ) : (
              <ul className="space-y-1">
                {historyEntries.map((entry) => (
                  <li key={entry.query} className="flex items-center gap-2 group">
                    <button
                      onClick={() => {
                        setQuery(entry.query);
                        setShowHistory(false);
                        setTimeout(() => {
                          inputRef.current?.focus();
                          handleSearch();
                        }, 0);
                      }}
                      className="flex-1 text-left px-3 py-2 hover:bg-amber-100 transition border border-transparent hover:border-stone-300"
                    >
                      <span className="display-font text-stone-900">{entry.query}</span>
                      <span className="mono-font text-[10px] text-stone-500 ml-2">
                        {new Date(entry.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </button>
                    <button
                      onClick={() => setHistoryEntries(history.remove(entry.query))}
                      className="mono-font text-[10px] uppercase tracking-widest text-stone-500 hover:text-red-900 transition opacity-0 group-hover:opacity-100"
                      aria-label={`Remove "${entry.query}" from history`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 pt-3 mt-3 border-t border-stone-300">
              Stored locally · last {HISTORY_MAX} queries · click to re-run
            </p>
          </section>
        )}

        {showSettings && (
          <section className="fade-in mb-8 border-2 border-stone-900 bg-amber-50 p-5">
            <h2 className="mono-font text-xs uppercase tracking-widest text-stone-700 mb-4">Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-1">
                  Europeana API key <span className="text-red-900">(required for Europeana)</span>
                </label>
                <input
                  type="text"
                  value={settings.europeanaKey}
                  onChange={e => saveSettings({ ...settings, europeanaKey: e.target.value })}
                  placeholder="paste your key here"
                  className="w-full bg-white border border-stone-400 px-3 py-2 mono-font text-sm focus:outline-none focus:border-stone-900"
                />
                <p className="text-xs text-stone-600 mt-1">
                  Free + instant. Register at <a href="https://api.europeana.eu/api/v2/apikey.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-900">api.europeana.eu</a>.
                </p>
              </div>
              <div>
                <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-1">
                  OpenAlex API key <span className="text-stone-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={settings.openAlexKey}
                  onChange={e => saveSettings({ ...settings, openAlexKey: e.target.value })}
                  placeholder="paste your OpenAlex key here"
                  className="w-full bg-white border border-stone-400 px-3 py-2 mono-font text-sm focus:outline-none focus:border-stone-900"
                />
                <p className="text-xs text-stone-600 mt-1">
                  Works without a key via the polite pool (rate-limited). For higher quotas, free 30-second signup at <a href="https://openalex.org/settings/api" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-900">openalex.org/settings/api</a>. If you've added a Crossref email below, it'll be passed to OpenAlex too for polite-pool priority.
                </p>
              </div>

              <div>
                <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-1">
                  Email for Crossref polite pool <span className="text-stone-500">(optional, faster + nicer)</span>
                </label>
                <input
                  type="email"
                  value={settings.crossrefEmail}
                  onChange={e => saveSettings({ ...settings, crossrefEmail: e.target.value })}
                  placeholder="you@example.com"
                  className="w-full bg-white border border-stone-400 px-3 py-2 mono-font text-sm focus:outline-none focus:border-stone-900"
                />
                <p className="text-xs text-stone-600 mt-1">
                  Crossref (different service from OpenAlex) lets you opt into a faster lane just by including your email — no signup, no key. Optional but recommended.
                </p>
              </div>

              <div>
                <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-1">
                  Semantic Scholar API key <span className="text-stone-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={settings.s2Key}
                  onChange={e => saveSettings({ ...settings, s2Key: e.target.value })}
                  placeholder="paste your S2 key here"
                  className="w-full bg-white border border-stone-400 px-3 py-2 mono-font text-sm focus:outline-none focus:border-stone-900"
                />
                <p className="text-xs text-stone-600 mt-1">
                  Free but approval can take days. Request at <a href="https://www.semanticscholar.org/product/api#api-key-form" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-900">semanticscholar.org/product/api</a>. Without a key, the S2 section will show an error — the other sources still work.
                </p>
              </div>

              <div className="pt-4 border-t border-stone-300">
                <p className="mono-font text-xs uppercase tracking-wider text-stone-700 mb-3">Extension API keys (only needed if you enable that source)</p>
                <div className="space-y-3">
                  <div>
                    <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-1">
                      Smithsonian API key
                    </label>
                    <input
                      type="text"
                      value={settings.smithsonianKey}
                      onChange={e => saveSettings({ ...settings, smithsonianKey: e.target.value })}
                      placeholder="paste your api.data.gov key"
                      className="w-full bg-white border border-stone-400 px-3 py-2 mono-font text-sm focus:outline-none focus:border-stone-900"
                    />
                    <p className="text-xs text-stone-600 mt-1">
                      Free, instant. Sign up at <a href="https://api.data.gov/signup/" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-900">api.data.gov/signup</a>.
                    </p>
                  </div>
                  <div>
                    <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-1">
                      DPLA API key
                    </label>
                    <input
                      type="text"
                      value={settings.dplaKey}
                      onChange={e => saveSettings({ ...settings, dplaKey: e.target.value })}
                      placeholder="paste your DPLA key"
                      className="w-full bg-white border border-stone-400 px-3 py-2 mono-font text-sm focus:outline-none focus:border-stone-900"
                    />
                    <p className="text-xs text-stone-600 mt-1">
                      Free, request via email per <a href="https://pro.dp.la/developers/policies" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-900">DPLA's instructions</a>.
                    </p>
                  </div>
                  <div>
                    <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-1">
                      Rijksmuseum API key
                    </label>
                    <input
                      type="text"
                      value={settings.rijksKey}
                      onChange={e => saveSettings({ ...settings, rijksKey: e.target.value })}
                      placeholder="paste your Rijksstudio key"
                      className="w-full bg-white border border-stone-400 px-3 py-2 mono-font text-sm focus:outline-none focus:border-stone-900"
                    />
                    <p className="text-xs text-stone-600 mt-1">
                      Free, instant. Register a Rijksstudio account at <a href="https://www.rijksmuseum.nl/en/rijksstudio" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-900">rijksmuseum.nl</a>, key is in advanced settings.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-stone-300">
                <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-2">
                  Curated journals <span className="text-stone-500">({settings.curatedJournals.length} configured)</span>
                </label>
                <p className="text-xs text-stone-600 mb-3">
                  Trusted journals searched in the Curated Journals section. Find an ISSN on the journal's homepage or via <a href="https://portal.issn.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-900">portal.issn.org</a>.
                </p>
                <div className="space-y-2 mb-3">
                  {settings.curatedJournals.map((j, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white border border-stone-300 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-stone-900 truncate">{j.name}</div>
                        <div className="mono-font text-[10px] text-stone-500">ISSN {j.issn}</div>
                      </div>
                      <button
                        onClick={() => saveSettings({
                          ...settings,
                          curatedJournals: settings.curatedJournals.filter((_, i) => i !== idx)
                        })}
                        className="mono-font text-[10px] uppercase tracking-widest text-red-900 hover:text-red-700 transition shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {settings.curatedJournals.length === 0 && (
                    <p className="display-font italic text-sm text-stone-500 px-3 py-2">
                      No journals configured — the Curated Journals section will show an error.
                    </p>
                  )}
                </div>
                <AddJournalForm
                  onAdd={(name, issn) => saveSettings({
                    ...settings,
                    curatedJournals: [...settings.curatedJournals, { name, issn }]
                  })}
                />
                {settings.curatedJournals.length === 0 && (
                  <button
                    onClick={() => saveSettings({ ...settings, curatedJournals: DEFAULT_CURATED_JOURNALS })}
                    className="mono-font text-[10px] uppercase tracking-widest text-stone-700 hover:text-red-900 transition mt-2 underline"
                  >
                    Reset to defaults
                  </button>
                )}
              </div>

              <div className="pt-4 border-t border-stone-300">
                <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-3">
                  Sources
                </label>
                <SourcesPanel
                  adapters={ADAPTERS}
                  settings={settings}
                  isEnabled={isAdapterEnabled}
                  onToggle={toggleAdapter}
                />
              </div>

              <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 pt-2 border-t border-stone-300">
                Saved locally — never sent anywhere except the relevant API.
              </p>
            </div>
          </section>
        )}

        {/* Search input */}
        <section className="mb-10">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="The only good is knowledge, Sekhandur. The only evil is ignorance."
              className="w-full bg-transparent border-b-2 border-stone-900 py-4 pr-32 display-font text-xl md:text-2xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-red-900 transition"
              style={{ letterSpacing: "-0.01em" }}
            />
            <button
              onClick={handleSearch}
              disabled={!query.trim()}
              className="absolute right-0 top-1/2 -translate-y-1/2 mono-font text-xs uppercase tracking-widest bg-stone-900 text-amber-50 px-5 py-3 hover:bg-red-900 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Search →
            </button>
          </div>
          <p className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mt-2">
            All sources queried in parallel · zero AI tokens
          </p>
        </section>

        {/* Results — one section per ENABLED adapter */}
        {hasSearched && (
          <div className="space-y-12">
            {ADAPTERS.filter(isAdapterEnabled).map(adapter => {
              const state = sectionStates[adapter.id] || {};
              return (
                <SourceSection
                  key={adapter.id}
                  adapter={adapter}
                  state={state}
                  onCopy={copyText}
                  copied={copied}
                  isInLibrary={isInLibrary}
                  onToggleLibrary={toggleLibrary}
                  onLoadMore={handleLoadMore}
                />
              );
            })}

            {/* Launcher block: external archives without queryable APIs.
                Grouped by region, collapsible. Same visual treatment as JSTOR. */}
            <LauncherBlock query={query} launchers={LAUNCHERS} />
          </div>
        )}

        {/* Empty state — pre-search */}
        {!hasSearched && settingsLoaded && (
          <div className="py-12 text-center">
            <p className="display-font italic text-xl text-stone-600 mb-6">
              Type a topic, hit search. Multiple databases at once.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
              {ADAPTERS.map(a => (
                <div key={a.id} className="border border-stone-400 p-3 text-left">
                  <div className={`mono-font text-[10px] uppercase tracking-widest inline-block ${a.color.bg} ${a.color.text} px-2 py-1 mb-2`}>
                    {a.name}
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed">{a.tagline}</p>
                </div>
              ))}
            </div>
            {!settings.europeanaKey && (
              <p className="mono-font text-[10px] uppercase tracking-widest text-amber-900 mt-6">
                ⚙ add your free Europeana key in settings to enable that source
              </p>
            )}
          </div>
        )}

        {/* Connect card — collapsible */}
        <section className="mt-16">
          <details className="group border-2 border-stone-900 bg-amber-50/40 transition">
            <summary className="cursor-pointer list-none flex items-center justify-between p-5 hover:bg-amber-100/40 transition">
              <div>
                <h3 className="display-font text-xl md:text-2xl font-bold text-stone-900 leading-tight">Connect with the maker</h3>
                <p className="display-font italic text-sm text-stone-600 mt-1">Building OpenCITE and other tools — let's talk.</p>
              </div>
              <span className="mono-font text-xs uppercase tracking-widest text-stone-700 ml-4 transition group-open:rotate-180 inline-block">▾</span>
            </summary>
            <div className="border-t border-stone-300 p-5 md:p-6 grid md:grid-cols-[1fr_auto] gap-6 items-center">
              <div>
                <p className="display-font text-stone-800 mb-3 leading-relaxed">
                  OpenCITE is built by Shahbaz Yusuf — open to collaboration, feature ideas, or just a hello from a fellow researcher or builder.
                </p>
                <p className="display-font italic text-stone-600 mb-5 leading-relaxed text-sm">
                  If this tool saved you time, the kindest thing you can do is connect — building in public is more fun with company.
                </p>
                <a
                  href="https://www.linkedin.com/in/shahbaz-yusuf/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mono-font text-xs uppercase tracking-widest bg-stone-900 text-amber-50 px-5 py-3 hover:bg-red-900 transition"
                >
                  Connect on LinkedIn ↗
                </a>
              </div>
              <div className="flex flex-col items-center">
                <img
                  src="/opencite-linkedin-qr.jpeg"
                  alt="QR code linking to Shahbaz Yusuf's LinkedIn profile"
                  className="w-36 h-36 md:w-40 md:h-40 border-2 border-stone-900 bg-white p-1"
                />
                <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 mt-2">
                  scan to connect
                </p>
              </div>
            </div>
          </details>
        </section>

        <footer className="mt-12 pt-6 border-t border-stone-400">
          <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 leading-relaxed">
            Always verify citations against the original source · Italics may need reapplying after paste · Built to be hostable + extensible
          </p>
        </footer>
      </div>
    </div>
  );
}

// ---------- Section component ----------

function SourceSection({ adapter, state, onCopy, copied, isInLibrary, onToggleLibrary, onLoadMore }) {
  const { loading, results, error, hasMore, loadingMore } = state;

  return (
    <section className="fade-in border-l-4 pl-5 md:pl-7 py-2" style={{ borderColor: "rgb(28, 25, 23)" }}>
      <div className="flex items-baseline gap-3 mb-1 flex-wrap">
        <span className={`mono-font text-[10px] uppercase tracking-widest ${adapter.color.bg} ${adapter.color.text} px-2 py-1`}>
          {adapter.name}
        </span>
        {loading && (
          <span className="mono-font text-xs text-stone-500 flex items-center gap-1">
            <span className="pulse-dot">●</span> searching…
          </span>
        )}
        {!loading && results && (
          <span className="mono-font text-xs text-stone-500">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <p className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-5">{adapter.tagline}</p>

      {loading && <div className="text-stone-500 italic display-font py-3">Querying {adapter.name}…</div>}

      {error && (
        <div className="border border-red-900 bg-red-50 p-3 mb-3">
          <p className="mono-font text-xs text-red-900">{error}</p>
        </div>
      )}

      {!loading && results && results.length === 0 && (
        <p className="display-font italic text-stone-600 py-3">No matches in {adapter.name}.</p>
      )}

      {!loading && results && results.length > 0 && (
        <div className="space-y-6">
          {results.map((r, i) => (
            <ResultCard
              key={r.id}
              result={r}
              index={i}
              onCopy={onCopy}
              copied={copied}
              isInLibrary={isInLibrary ? isInLibrary(r) : false}
              onToggleLibrary={onToggleLibrary}
            />
          ))}
        </div>
      )}

      {!loading && results && results.length > 0 && hasMore && (
        <div className="mt-5">
          <button
            onClick={() => onLoadMore && onLoadMore(adapter.id)}
            disabled={loadingMore}
            className="mono-font text-[10px] uppercase tracking-widest border border-stone-700 text-stone-700 px-4 py-2 hover:bg-stone-900 hover:text-amber-50 hover:border-stone-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingMore ? "Loading…" : "↓ Load 5 more from " + adapter.name}
          </button>
        </div>
      )}
    </section>
  );
}

function ResultCard({ result, index, onCopy, copied, isInLibrary, onToggleLibrary }) {
  const mlaSegs = buildMLA(result);
  const apaSegs = buildAPA(result);
  const mlaPlain = segmentsToPlain(mlaSegs);
  const apaPlain = segmentsToPlain(apaSegs);
  const cardId = result.id;
  const [imgFailed, setImgFailed] = useState(false);
  const hasImage = result.previewImage && !imgFailed;

  return (
    <article className="border border-stone-300 bg-stone-50/40 p-4 md:p-5">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="display-font text-xl font-black text-stone-900">№{String(index + 1).padStart(2, "0")}</span>
        {result.year && <span className="mono-font text-xs text-stone-600">{result.year}</span>}
        {!result.isOA && (
          <span className="mono-font text-[10px] uppercase tracking-widest text-amber-900">may be paywalled</span>
        )}
        {onToggleLibrary && (
          <button
            onClick={() => onToggleLibrary(result)}
            className={`ml-auto mono-font text-xs transition ${isInLibrary ? "text-amber-700 hover:text-red-900" : "text-stone-400 hover:text-amber-700"}`}
            aria-label={isInLibrary ? "Remove from library" : "Save to library"}
            title={isInLibrary ? "Saved — click to remove" : "Save to library"}
          >
            {isInLibrary ? "★ Saved" : "☆ Save"}
          </button>
        )}
      </div>

      <div className={hasImage ? "grid grid-cols-[120px_1fr] md:grid-cols-[160px_1fr] gap-4 md:gap-5" : ""}>
        {hasImage && (
          <div className="shrink-0">
            <a href={result.url || result.previewImage} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={result.previewImage}
                alt={result.title}
                loading={index < 2 ? "eager" : "lazy"}
                onError={() => setImgFailed(true)}
                className="w-full aspect-square object-cover border border-stone-300 bg-stone-100"
              />
            </a>
          </div>
        )}

        <div>
          <h4 className="display-font text-lg md:text-xl font-bold text-stone-900 mb-1 leading-tight" style={{ letterSpacing: "-0.01em" }}>
            {result.title}
          </h4>

          {result.authors?.length > 0 && (
            <p className="display-font italic text-sm text-stone-700 mb-1">
              {result.authors.slice(0, 4).join(", ")}{result.authors.length > 4 ? ", et al." : ""}
            </p>
          )}
          {(result.journal || result.publisher) && (
            <p className="mono-font text-[10px] uppercase tracking-wider text-stone-600 mb-3">
              {result.journal || result.publisher}
            </p>
          )}

          {result.abstract && (
            <p className="text-sm text-stone-800 leading-relaxed mb-3">
              {truncate(result.abstract, hasImage ? 200 : 280)}
            </p>
          )}
        </div>
      </div>

      {result.url && (
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mono-font text-[10px] uppercase tracking-widest text-stone-900 underline-thick hover:text-red-900 transition mb-4 break-all"
        >
          Read full text →
        </a>
      )}

      <div className="bg-white border border-stone-300 p-3 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="mono-font text-[10px] uppercase tracking-widest text-stone-700">MLA 9</span>
            <button
              onClick={() => onCopy(mlaPlain, cardId, "mla")}
              className="mono-font text-[10px] uppercase tracking-widest text-stone-700 hover:text-red-900 transition"
            >
              {copied.id === cardId && copied.style === "mla" ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs md:text-sm text-stone-800 leading-relaxed">
            {mlaSegs.map((s, j) => s.italic ? <em key={j}>{s.text}</em> : <span key={j}>{s.text}</span>)}
          </p>
        </div>
        <div className="pt-2 border-t border-stone-200">
          <div className="flex items-center justify-between mb-1">
            <span className="mono-font text-[10px] uppercase tracking-widest text-stone-700">APA 7</span>
            <button
              onClick={() => onCopy(apaPlain, cardId, "apa")}
              className="mono-font text-[10px] uppercase tracking-widest text-stone-700 hover:text-red-900 transition"
            >
              {copied.id === cardId && copied.style === "apa" ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs md:text-sm text-stone-800 leading-relaxed">
            {apaSegs.map((s, j) => s.italic ? <em key={j}>{s.text}</em> : <span key={j}>{s.text}</span>)}
          </p>
        </div>
      </div>
    </article>
  );
}

// Inline form for adding a new curated journal
function AddJournalForm({ onAdd }) {
  const [name, setName] = useState("");
  const [issn, setIssn] = useState("");

  const normalizeIssn = (s) => {
    const cleaned = (s || "").replace(/[^0-9Xx]/g, "").toUpperCase();
    if (cleaned.length === 8) return cleaned.slice(0, 4) + "-" + cleaned.slice(4);
    return s;
  };

  const submit = () => {
    const finalIssn = normalizeIssn(issn);
    if (!name.trim() || !/^\d{4}-\d{3}[\dX]$/.test(finalIssn)) return;
    onAdd(name.trim(), finalIssn);
    setName("");
    setIssn("");
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Journal name"
        className="flex-1 bg-white border border-stone-400 px-3 py-2 text-sm focus:outline-none focus:border-stone-900"
      />
      <input
        type="text"
        value={issn}
        onChange={e => setIssn(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder="ISSN (e.g. 2150-8925)"
        className="sm:w-44 bg-white border border-stone-400 px-3 py-2 mono-font text-sm focus:outline-none focus:border-stone-900"
      />
      <button
        onClick={submit}
        disabled={!name.trim() || !/^\d{4}-?\d{3}[\dX]$/i.test(issn.replace(/\s/g, ""))}
        className="mono-font text-xs uppercase tracking-widest bg-stone-900 text-amber-50 px-4 py-2 hover:bg-red-900 transition disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Add
      </button>
    </div>
  );
}

// ---------- LAUNCHER BLOCK ----------
// Renders the launcher list grouped by region, in collapsible sub-blocks.
// Same visual treatment as the original JSTOR block. Uses native <details>.
function LauncherBlock({ query, launchers }) {
  // Group launchers by region. A launcher with multiple regions appears under each.
  const groups = {};
  launchers.forEach(L => {
    L.region.forEach(r => {
      if (!groups[r]) groups[r] = [];
      // Avoid duplicates (a launcher already added under this region)
      if (!groups[r].some(x => x.id === L.id)) groups[r].push(L);
    });
  });

  // Order regions deliberately so the most general comes first
  const regionOrder = [
    "global", "north-america", "europe", "latin-america",
    "mena", "north-africa", "sahel", "west-africa", "sub-saharan-africa",
    "central-asia", "south-asia", "east-asia"
  ];
  const orderedRegions = regionOrder.filter(r => groups[r]?.length);

  return (
    <section className="border-l-4 border-stone-400 pl-5 md:pl-7 py-2">
      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <span className="mono-font text-[10px] uppercase tracking-widest bg-stone-700 text-stone-50 px-2 py-1">External</span>
        <span className="mono-font text-xs text-stone-500">launchers · open in new tab</span>
      </div>
      <p className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-5">
        Archives without queryable APIs · pre-filled search opens in a new tab
      </p>

      <div className="space-y-2">
        {orderedRegions.map(region => (
          <details key={region} className="group border border-stone-300 bg-stone-50/40">
            <summary className="cursor-pointer list-none flex items-center justify-between p-3 hover:bg-stone-100/40 transition">
              <span className="display-font font-bold text-stone-900">{TAG_VOCAB.region[region]}</span>
              <span className="mono-font text-[10px] uppercase tracking-widest text-stone-600">
                {groups[region].length} {groups[region].length === 1 ? "source" : "sources"} <span className="ml-2 inline-block group-open:rotate-180 transition">▾</span>
              </span>
            </summary>
            <div className="border-t border-stone-300 p-3 space-y-2">
              {groups[region].map(L => (
                <div key={L.id} className="flex items-start gap-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="display-font font-bold text-stone-900">{L.name}</div>
                    <div className="mono-font text-[10px] uppercase tracking-widest text-stone-600 mb-1">{L.tagline}</div>
                    <div className="flex flex-wrap gap-1">
                      {L.contentType.map(ct => (
                        <span key={ct} className="mono-font text-[9px] uppercase tracking-widest bg-stone-200 text-stone-700 px-1.5 py-0.5">
                          {TAG_VOCAB.contentType[ct] || ct}
                        </span>
                      ))}
                      {L.archiveType.map(at => (
                        <span key={at} className="mono-font text-[9px] uppercase tracking-widest bg-amber-100 text-amber-900 px-1.5 py-0.5">
                          {TAG_VOCAB.archiveType[at] || at}
                        </span>
                      ))}
                    </div>
                  </div>
                  <a
                    href={L.buildUrl(query)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 mono-font text-[10px] uppercase tracking-widest bg-stone-700 text-amber-50 px-3 py-2 hover:bg-stone-900 transition whitespace-nowrap"
                  >
                    Open ↗
                  </a>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

// ---------- SOURCES PANEL ----------
// Settings UI for toggling extension adapters on/off. Grouped by region in
// collapsible sub-blocks. Core adapters are shown at top as info-only (cannot be toggled).
function SourcesPanel({ adapters, settings, isEnabled, onToggle }) {
  const core = adapters.filter(a => a.category === ADAPTER_CATEGORY.CORE);
  const extensions = adapters.filter(a => a.category === ADAPTER_CATEGORY.EXTENSION);

  // Group extensions by region (first region of each adapter)
  const groups = {};
  extensions.forEach(a => {
    const region = a.region?.[0] || "global";
    if (!groups[region]) groups[region] = [];
    groups[region].push(a);
  });
  const regionOrder = [
    "global", "north-america", "europe", "latin-america",
    "mena", "north-africa", "sahel", "west-africa", "sub-saharan-africa",
    "central-asia", "south-asia", "east-asia"
  ];
  const orderedRegions = regionOrder.filter(r => groups[r]?.length);

  return (
    <div className="space-y-4">
      <div>
        <p className="mono-font text-xs uppercase tracking-wider text-stone-700 mb-2">Always on (core)</p>
        <div className="space-y-1">
          {core.map(a => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <span className={`mono-font text-[10px] uppercase tracking-widest ${a.color.bg} ${a.color.text} px-2 py-0.5`}>{a.name}</span>
              <span className="text-stone-600">{a.tagline}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mono-font text-xs uppercase tracking-wider text-stone-700 mb-2">Extensions (opt-in, off by default)</p>
        <p className="text-xs text-stone-600 mb-3">
          Niche archives. Toggle on the ones relevant to your research. Some require their own free API key (yellow tag).
        </p>
        <div className="space-y-2">
          {orderedRegions.map(region => (
            <details key={region} className="group border border-stone-300 bg-white/40">
              <summary className="cursor-pointer list-none flex items-center justify-between p-3 hover:bg-stone-100/60 transition">
                <span className="display-font font-bold text-stone-900">{TAG_VOCAB.region[region]}</span>
                <span className="mono-font text-[10px] uppercase tracking-widest text-stone-600">
                  {groups[region].filter(isEnabled).length}/{groups[region].length} on <span className="ml-2 inline-block group-open:rotate-180 transition">▾</span>
                </span>
              </summary>
              <div className="border-t border-stone-300 p-3 space-y-3">
                {groups[region].map(a => {
                  const enabled = isEnabled(a);
                  const needsKeyMissing = a.needsKey && !settings[a.keyName];
                  return (
                    <div key={a.id} className="flex items-start gap-3">
                      <button
                        onClick={() => onToggle(a.id)}
                        className={`shrink-0 mt-1 w-10 h-5 rounded-full transition relative ${enabled ? "bg-stone-900" : "bg-stone-300"}`}
                        aria-label={enabled ? `Disable ${a.name}` : `Enable ${a.name}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${enabled ? "left-5" : "left-0.5"}`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className={`mono-font text-[10px] uppercase tracking-widest ${a.color.bg} ${a.color.text} px-2 py-0.5`}>{a.name}</span>
                          {a.needsKey && (
                            <span className={`mono-font text-[9px] uppercase tracking-widest px-1.5 py-0.5 ${needsKeyMissing ? "bg-red-100 text-red-900" : "bg-yellow-100 text-yellow-900"}`}>
                              {needsKeyMissing ? "key missing" : "needs key"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-700 mt-1">{a.tagline}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(a.contentType || []).map(ct => (
                            <span key={ct} className="mono-font text-[9px] uppercase tracking-widest bg-stone-200 text-stone-700 px-1.5 py-0.5">
                              {TAG_VOCAB.contentType[ct] || ct}
                            </span>
                          ))}
                          {(a.archiveType || []).map(at => (
                            <span key={at} className="mono-font text-[9px] uppercase tracking-widest bg-amber-100 text-amber-900 px-1.5 py-0.5">
                              {TAG_VOCAB.archiveType[at] || at}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
