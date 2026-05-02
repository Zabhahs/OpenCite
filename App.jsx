import React, { useState, useRef, useEffect, useCallback } from "react";

/* ============================================================================
   THE STACKS — v.04
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

// ---------- ADAPTERS ----------

const DOAJ_ADAPTER = {
  id: "DOAJ",
  name: "DOAJ",
  tagline: "Directory of Open Access Journals · peer-reviewed",
  color: { bg: "bg-amber-900", text: "text-amber-50" },
  needsKey: false,
  search: async (query) => {
    const url = `https://doaj.org/api/v3/search/articles/${encodeURIComponent(query)}?pageSize=3&page=1`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`DOAJ ${r.status}`);
    const data = await r.json();
    return (data.results || []).map((a, i) => {
      const b = a.bibjson || {};
      const doi = (b.identifier || []).find(x => x.type === "doi")?.id || "";
      const fulltext = (b.link || []).find(x => x.type === "fulltext")?.url || "";
      return {
        id: `doaj-${a.id || i}`,
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
  }
};

const OPENALEX_ADAPTER = {
  id: "OPENALEX",
  name: "OpenAlex",
  tagline: "250M+ scholarly works · OA-filtered",
  color: { bg: "bg-stone-800", text: "text-stone-50" },
  needsKey: false,
  search: async (query, settings) => {
    const mailto = settings.openAlexEmail ? `&mailto=${encodeURIComponent(settings.openAlexEmail)}` : "";
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=is_oa:true&per_page=3${mailto}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`OpenAlex ${r.status}`);
    const data = await r.json();
    return (data.results || []).map(parseOpenAlexWork);
  }
};

const SEMANTIC_SCHOLAR_ADAPTER = {
  id: "S2",
  name: "Semantic Scholar",
  tagline: "AI-curated · cross-disciplinary",
  color: { bg: "bg-red-900", text: "text-red-50" },
  needsKey: false,
  search: async (query) => {
    const fields = "title,authors,year,venue,abstract,openAccessPdf,externalIds,journal";
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=3&fields=${fields}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      if (r.status === 429) throw new Error("Semantic Scholar rate-limited. Try again in a moment.");
      throw new Error(`Semantic Scholar ${r.status}`);
    }
    const data = await r.json();
    return (data.data || []).map((p, i) => {
      const doi = p.externalIds?.DOI || "";
      const oaUrl = p.openAccessPdf?.url || "";
      return {
        id: `s2-${p.paperId || i}`,
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
  }
};

const EUROPEANA_ADAPTER = {
  id: "EUROPEANA",
  name: "Europeana",
  tagline: "Cultural heritage · museums · primary sources",
  color: { bg: "bg-emerald-900", text: "text-emerald-50" },
  needsKey: true,
  keyName: "europeanaKey",
  keyLabel: "Europeana API key",
  keyHelp: "Free, instant. Register at api.europeana.eu — paste the key here.",
  search: async (query, settings) => {
    if (!settings.europeanaKey) {
      throw new Error("Europeana needs a free API key. Open settings (⚙) to add yours.");
    }
    const url = `https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(settings.europeanaKey)}&query=${encodeURIComponent(query)}&rows=3&profile=rich`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`Europeana ${r.status}`);
    const data = await r.json();
    if (data.success === false) throw new Error(data.error || "Europeana request rejected — check your API key.");
    return (data.items || []).map((it, i) => {
      const title = Array.isArray(it.title) ? it.title[0] : (it.title || "Untitled");
      const creators = it.dcCreator || it.edmAgentLabel || [];
      const year = (it.year && it.year[0]) || (it.edmTimespanLabel && it.edmTimespanLabel[0]?.def) || "";
      const provider = (it.dataProvider && it.dataProvider[0]) || "";
      const description = (it.dcDescription && it.dcDescription[0]) || "";
      const link = (it.edmIsShownAt && it.edmIsShownAt[0]) || it.guid || "";
      return {
        id: `eu-${it.id || i}`,
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
        type: "primary-source"
      };
    });
  }
};

const CURATED_JOURNALS_ADAPTER = {
  id: "CURATED",
  name: "Curated Journals",
  tagline: "Your hand-picked trusted sources · powered by OpenAlex",
  color: { bg: "bg-amber-700", text: "text-amber-50" },
  needsKey: false,
  search: async (query, settings) => {
    const journals = settings.curatedJournals || [];
    const issns = journals.map(j => j.issn).filter(Boolean);
    if (issns.length === 0) {
      throw new Error("No curated journals configured. Add some in settings (⚙).");
    }
    const issnFilter = issns.join("|");
    const mailto = settings.openAlexEmail ? `&mailto=${encodeURIComponent(settings.openAlexEmail)}` : "";
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=primary_location.source.issn:${issnFilter}&per_page=5${mailto}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`OpenAlex ${r.status}`);
    const data = await r.json();
    // Use OpenAlex parser, then re-tag the source as CURATED for badge display
    return (data.results || []).map(parseOpenAlexWork).map(item => ({ ...item, source: "CURATED" }));
  }
};

const ADAPTERS = [DOAJ_ADAPTER, OPENALEX_ADAPTER, SEMANTIC_SCHOLAR_ADAPTER, EUROPEANA_ADAPTER, CURATED_JOURNALS_ADAPTER];

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
  const [settings, setSettings] = useState({ europeanaKey: "", openAlexEmail: "", curatedJournals: DEFAULT_CURATED_JOURNALS });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const inputRef = useRef(null);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const eu = localStorage.getItem("europeanaKey") || "";
      const oa = localStorage.getItem("openAlexEmail") || "";
      const cjRaw = localStorage.getItem("curatedJournals");
      let parsedJournals = DEFAULT_CURATED_JOURNALS;
      if (cjRaw) {
        try {
          const arr = JSON.parse(cjRaw);
          if (Array.isArray(arr)) parsedJournals = arr;
        } catch {}
      }
      setSettings({
        europeanaKey: eu,
        openAlexEmail: oa,
        curatedJournals: parsedJournals
      });
    } catch {}
    setSettingsLoaded(true);
    inputRef.current?.focus();
  }, []);

  const saveSettings = (newSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem("europeanaKey", newSettings.europeanaKey || "");
      localStorage.setItem("openAlexEmail", newSettings.openAlexEmail || "");
      localStorage.setItem("curatedJournals", JSON.stringify(newSettings.curatedJournals || []));
    } catch {}
  };

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setHasSearched(true);

    // Initialize all sections to loading
    const initialStates = {};
    ADAPTERS.forEach(a => { initialStates[a.id] = { loading: true, results: null, error: null }; });
    setSectionStates(initialStates);

    // Fire all adapters in parallel; update each as it returns
    ADAPTERS.forEach(async (adapter) => {
      try {
        const results = await adapter.search(query, settings);
        setSectionStates(prev => ({
          ...prev,
          [adapter.id]: { loading: false, results: results || [], error: null }
        }));
      } catch (err) {
        setSectionStates(prev => ({
          ...prev,
          [adapter.id]: { loading: false, results: null, error: err.message || "Search failed" }
        }));
      }
    });
  }, [query, settings]);

  const copyText = (text, id, style) => {
    navigator.clipboard.writeText(text);
    setCopied({ id, style });
    setTimeout(() => setCopied({ id: null, style: null }), 1500);
  };

  const jstorUrl = `https://www.jstor.org/action/doBasicSearch?Query=${encodeURIComponent(query)}`;

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: "radial-gradient(ellipse at top, #f5ecd9 0%, #ede0c4 60%, #e4d3b0 100%)",
        fontFamily: "'Source Serif 4', Georgia, serif"
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,700;9..144,900&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=JetBrains+Mono:wght@400;500&display=swap');
        .display-font { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; }
        .mono-font { font-family: 'JetBrains Mono', monospace; }
        .grain::before {
          content: ''; position: fixed; inset: 0; pointer-events: none;
          opacity: 0.04; z-index: 1;
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
            <span className="mono-font text-xs uppercase tracking-[0.3em] text-stone-600">v.04 / four sources</span>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="mono-font text-xs uppercase tracking-widest text-stone-600 hover:text-red-900 transition"
            >
              ⚙ settings
            </button>
          </div>
          <div className="border-t-2 border-stone-900 pt-6">
            <h1 className="display-font text-5xl md:text-7xl font-black leading-none text-stone-900 mb-3" style={{ letterSpacing: "-0.02em" }}>
              The Stacks
            </h1>
            <p className="display-font italic text-lg md:text-xl text-stone-700 max-w-xl mb-3">
              A meta-search across four free scholarly databases. Citations ready to paste.
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
                  Email for OpenAlex polite pool <span className="text-stone-500">(optional, faster + nicer)</span>
                </label>
                <input
                  type="email"
                  value={settings.openAlexEmail}
                  onChange={e => saveSettings({ ...settings, openAlexEmail: e.target.value })}
                  placeholder="you@example.com"
                  className="w-full bg-white border border-stone-400 px-3 py-2 mono-font text-sm focus:outline-none focus:border-stone-900"
                />
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
              placeholder="e.g., Marxist readings of Frankenstein, Ottoman archival historiography…"
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
            All four databases queried in parallel · zero AI tokens
          </p>
        </section>

        {/* Results — one section per adapter */}
        {hasSearched && (
          <div className="space-y-12">
            {ADAPTERS.map(adapter => {
              const state = sectionStates[adapter.id] || {};
              return (
                <SourceSection
                  key={adapter.id}
                  adapter={adapter}
                  state={state}
                  onCopy={copyText}
                  copied={copied}
                />
              );
            })}

            {/* JSTOR launcher */}
            <section className="border-l-4 border-stone-400 pl-5 md:pl-7 py-2">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className="mono-font text-[10px] uppercase tracking-widest bg-stone-700 text-stone-50 px-2 py-1">JSTOR</span>
                <span className="mono-font text-xs text-stone-500">launcher · uses your login</span>
              </div>
              <h3 className="display-font text-2xl font-bold text-stone-900 mb-2">Search JSTOR with this query</h3>
              <p className="text-stone-700 mb-4 max-w-2xl">
                JSTOR doesn't expose a public search API for individual accounts. Open this in a new tab to search with your free login (100 articles/month).
              </p>
              <a
                href={jstorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mono-font text-xs uppercase tracking-widest bg-stone-700 text-amber-50 px-5 py-3 hover:bg-stone-900 transition"
              >
                Open JSTOR search ↗
              </a>
            </section>
          </div>
        )}

        {/* Empty state — pre-search */}
        {!hasSearched && settingsLoaded && (
          <div className="py-12 text-center">
            <p className="display-font italic text-xl text-stone-600 mb-6">
              Type a topic, hit search. Four databases at once.
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

        <footer className="mt-20 pt-6 border-t border-stone-400">
          <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 leading-relaxed">
            Always verify citations against the original source · Italics may need reapplying after paste · Built to be hostable + extensible
          </p>
        </footer>
      </div>
    </div>
  );
}

// ---------- Section component ----------

function SourceSection({ adapter, state, onCopy, copied }) {
  const { loading, results, error } = state;

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
            <ResultCard key={r.id} result={r} index={i} onCopy={onCopy} copied={copied} />
          ))}
        </div>
      )}
    </section>
  );
}

function ResultCard({ result, index, onCopy, copied }) {
  const mlaSegs = buildMLA(result);
  const apaSegs = buildAPA(result);
  const mlaPlain = segmentsToPlain(mlaSegs);
  const apaPlain = segmentsToPlain(apaSegs);
  const cardId = result.id;

  return (
    <article className="border border-stone-300 bg-stone-50/40 p-4 md:p-5">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="display-font text-xl font-black text-stone-900">№{String(index + 1).padStart(2, "0")}</span>
        {result.year && <span className="mono-font text-xs text-stone-600">{result.year}</span>}
        {!result.isOA && (
          <span className="mono-font text-[10px] uppercase tracking-widest text-amber-900">may be paywalled</span>
        )}
      </div>

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
          {truncate(result.abstract, 280)}
        </p>
      )}

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
