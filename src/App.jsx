import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

// Hooks
import { useTheme } from "./hooks/useTheme.js";
import { useSettings } from "./hooks/useSettings.js";
import { useHistory } from "./hooks/useHistory.js";
import { useLibrary } from "./hooks/useLibrary.js";
import { useSearch } from "./hooks/useSearch.js";
import { useSemanticRerank } from "./hooks/useSemanticRerank.js";
import { useFilters } from "./hooks/useFilters.js";

// Data
import { ADAPTERS } from "./adapters/index.js";
import { LAUNCHERS } from "./launchers/index.js";
import { HISTORY_MAX } from "./constants/defaults.js";

// Components
import { SearchInput } from "./components/SearchInput.jsx";
import { SearchControls } from "./components/SearchControls.jsx";
import { FilterBar } from "./components/FilterBar.jsx";
import { SourceSection } from "./components/SourceSection.jsx";
import { UnifiedResultList } from "./components/UnifiedResultList.jsx";
import { SearchStatusBar } from "./components/SearchStatusBar.jsx";
import { LauncherBlock } from "./components/LauncherBlock.jsx";
import { Header, Footer, ConnectCard, ThemeStrip, KofiOverlay, AuthModal } from "./components/Layout.jsx";
import { SettingsPanel, HistoryPanel, LibraryPanel, PricingPanel } from "./components/Panels.jsx";
import { getPlatform } from "./lib/platform.js";

// Contexts
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { useAuth } from "./contexts/AuthContext.jsx";

// v.19 — admin gate + debug log
import { isAdmin } from "./lib/admin.js";
import { installDebugLog, getDebugLog } from "./lib/log.js";

function OpenCITE() {
  const [query, setQuery] = useState("");
  const [activePanel, setActivePanel] = useState(null);
  const [copied, setCopied] = useState({ id: null, style: null });
  const inputRef = useRef(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [searchCount, setSearchCount] = useState(0);
  const { status, user } = useAuth();

  // v.19 — admin status drives debug logger install + UI exposure
  const admin = isAdmin(user);

  const { themeKey, theme, changeTheme } = useTheme();
  const { settings, save: saveSettings, load: loadSettings, loaded, isEnabled, toggleAdapter } = useSettings();
  const hist = useHistory();
  const lib = useLibrary();
  const [filterState, setFilterState] = useState({});
  const { sectionStates, hasSearched, search, loadMore, reset, isSparseResults } = useSearch(settings, isEnabled);
  // v.31 — live Lexical↔Semantic fusion weight. Drives reranking immediately; persisted
  // to settings only on slider commit (avoids per-tick API/localStorage spam, §3).
  const [rrfWeight, setRrfWeight] = useState(settings.rrfSemanticWeight ?? 0.4);
  // Keep the live value in sync when settings load / sync from DB.
  useEffect(() => { setRrfWeight(settings.rrfSemanticWeight ?? 0.4); }, [settings.rrfSemanticWeight]);
  const { rerankedStates, rerankStatus } = useSemanticRerank(sectionStates, query, settings.semanticSearch, rrfWeight);
  const effectiveStates = rerankedStates || sectionStates;
  const filteredSections = useFilters(effectiveStates, filterState);

  // v.19 — install debug logger ring buffer once when admin signs in
  useEffect(() => {
    if (admin) installDebugLog();
  }, [admin]);

  // Bootstrap: load persisted state once on mount
  useEffect(() => {
    loadSettings();
    hist.load();
    lib.load();
    inputRef.current?.focus();
  }, []);

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    hist.add(query);
    setFilterState({});
    search(query);
    setSearchCount(c => {
      const next = c + 1;
      if (next >= 3 && status === "unauthenticated") {
        try { if (!localStorage.getItem("opencite_auth_prompted")) setShowAuthModal(true); } catch {}
      }
      return next;
    });
  }, [query, search, hist, status]);

  const handleRerun = useCallback((q) => {
    setQuery(q);
    setActivePanel(null);
    hist.add(q);
    search(q);
  }, [search, hist]);

  // Unified view: trigger loadMore only for adapters that are actually contributing
  // visible results. Firing for adapters whose results were all gated as low-confidence
  // fetches more junk that immediately gets filtered, making the button appear broken.
  const handleLoadMoreAll = useCallback(() => {
    ADAPTERS.filter(isEnabled).forEach(a => {
      const s = sectionStates[a.id];
      const fs = filteredSections[a.id];
      if (s?.hasMore && !s?.loadingMore && !s?.loading && (fs?.results?.length || 0) > 0) {
        loadMore(a.id, query);
      }
    });
  }, [sectionStates, filteredSections, loadMore, isEnabled, query]);

  const dismissModal = useCallback(() => {
    try { localStorage.setItem("opencite_auth_prompted", "1"); } catch {}
    setShowAuthModal(false);
  }, []);

  useEffect(() => {
    if (status !== "unauthenticated") return;
    try { if (localStorage.getItem("opencite_auth_prompted")) return; } catch {}
    const t = setTimeout(() => setShowAuthModal(true), 2000);
    return () => clearTimeout(t);
  }, [status]);

  // v.19 — triple-click logo: admin copies debug log; otherwise standard reset
  const logoClicks = useRef({ count: 0, timer: null });
  const handleLogoClick = useCallback(() => {
    if (admin) {
      logoClicks.current.count++;
      clearTimeout(logoClicks.current.timer);
      logoClicks.current.timer = setTimeout(() => { logoClicks.current.count = 0; }, 600);
      if (logoClicks.current.count >= 3) {
        logoClicks.current.count = 0;
        navigator.clipboard.writeText(getDebugLog()).catch(() => {});
        return;
      }
    }
    setQuery("");
    setActivePanel(null);
    reset();
    inputRef.current?.focus();
  }, [admin, reset]);

  // ── Derived view-mode state (memoized — avoids recomputation on every render) ──
  const isUnified = (settings.viewMode || "unified") === "unified";
  const enabledAdapters = useMemo(() => ADAPTERS.filter(isEnabled), [settings, isEnabled]);
  const allDone = useMemo(
    () => enabledAdapters.length > 0 && enabledAdapters.every(a => sectionStates[a.id] && !sectionStates[a.id].loading),
    [enabledAdapters, sectionStates]
  );

  const sortedAdapters = useMemo(() => {
    if (!allDone) return enabledAdapters;
    const sectionAvgScore = (id) => {
      const results = filteredSections[id]?.results || [];
      if (!results.length) return 0;
      return results.reduce((sum, r) => sum + (r._score ?? 0), 0) / results.length;
    };
    return [...enabledAdapters].sort((a, b) => {
      const cntA = sectionStates[a.id]?.results?.length || 0;
      const cntB = sectionStates[b.id]?.results?.length || 0;
      if (cntA > 0 && cntB === 0) return -1;
      if (cntA === 0 && cntB > 0) return 1;
      return sectionAvgScore(b.id) - sectionAvgScore(a.id);
    });
  }, [allDone, enabledAdapters, sectionStates, filteredSections]);

  const { withResults, withoutResults } = useMemo(() => {
    const withResults = sortedAdapters.filter(a => {
      const s = sectionStates[a.id];
      return s && (s.loading || s.error || (s.results?.length || 0) > 0);
    });
    const withoutResults = allDone
      ? sortedAdapters.filter(a => {
          const s = sectionStates[a.id];
          return s && !s.loading && !s.error && !(s.results?.length > 0);
        })
      : [];
    return { withResults, withoutResults };
  }, [sortedAdapters, sectionStates, allDone]);

  const copyText = (text, id, style) => {
    navigator.clipboard.writeText(text);
    setCopied({ id, style });
    setTimeout(() => setCopied({ id: null, style: null }), 1500);
  };

  const togglePanel = (panel) =>
    setActivePanel(prev => prev === panel ? null : panel);

  return (
    <div
      className="min-h-screen w-full"
      data-theme={themeKey}
      style={{
        background: theme.bg,
        fontFamily: "'Avenir Next', 'Avenir', 'Mulish', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        color: theme.fg,
        "--ui-fg": theme.fg, "--ui-fg-muted": theme.fgMuted, "--ui-fg-subtle": theme.fgSubtle,
        "--ui-border": theme.border, "--ui-border-subtle": theme.borderSubtle,
        "--ui-surface": theme.surface, "--ui-accent": theme.accent, "--ui-on-accent": theme.onAccent,
        "--ui-button-bg": theme.buttonBg, "--ui-settings-bg": theme.settingsBg, "--ui-input-bg": theme.inputBg,
        "--ui-grain-opacity": theme.grainOpacity,
        "--ui-eagle-blend": theme.eagleBlend, "--ui-eagle-shadow": theme.eagleShadow,
        "--ui-sticky-bg": theme.stickyBg, "--ui-title-color": theme.titleColor,
      }}
    >
      <div className="grain" />

      <div className="relative max-w-4xl mx-auto px-6 py-10 md:py-16" style={{ zIndex: 2 }}>
        <Header
          adapters={ADAPTERS}
          onLibrary={() => togglePanel("library")}
          onHistory={() => togglePanel("history")}
          onSettings={() => togglePanel("settings")}
          onPlans={() => togglePanel("plans")}
          onLogoClick={handleLogoClick}
          libraryCount={lib.items.length}
          historyCount={hist.entries.length}
          activePanel={activePanel}
        />

        {activePanel === "library" && (
          <LibraryPanel
            items={lib.items}
            onToggle={lib.toggle}
            onClear={lib.clear}
            onCopy={copyText}
            copied={copied}
          />
        )}

        {activePanel === "history" && (
          <HistoryPanel
            entries={hist.entries}
            onRerun={handleRerun}
            onRemove={hist.remove}
            onClear={hist.clear}
            historyMax={HISTORY_MAX}
          />
        )}

        {activePanel === "settings" && (
          <SettingsPanel
            settings={settings}
            onSave={saveSettings}
            adapters={ADAPTERS}
            isEnabled={isEnabled}
            onToggle={toggleAdapter}
            admin={admin}
          />
        )}

        {activePanel === "plans" && (
          <PricingPanel
            platform={getPlatform()}
            isAuthenticated={status === "authenticated"}
            onRequireAuth={() => setShowAuthModal(true)}
          />
        )}

        <ThemeStrip themeKey={themeKey} onChange={changeTheme} />

        <SearchInput
          query={query}
          onChange={setQuery}
          onSearch={handleSearch}
          inputRef={inputRef}
        />

        {/* v.31 — relevance slider + quick search settings, always visible under the search bar */}
        <SearchControls
          settings={settings}
          onSave={saveSettings}
          rrfWeight={rrfWeight}
          onRrfWeightChange={setRrfWeight}
          onRrfWeightCommit={(v) => saveSettings({ ...settings, rrfSemanticWeight: v })}
          onOpenSettings={() => setActivePanel("settings")}
        />

        {hasSearched && (
          <FilterBar
            sectionStates={sectionStates}
            filterState={filterState}
            onChange={setFilterState}
          />
        )}

        {hasSearched && (
          <div className="space-y-12">
            {/* D2 — sparse results prompt */}
            {isSparseResults && (
              <div className="border border-amber-300 bg-amber-50/60 px-4 py-3">
                <p className="mono-font text-[10px] uppercase tracking-widest text-amber-900">
                  Few results found — try different keywords, or use <strong>;</strong> to search multiple terms at once (e.g. <em>climate; global warming</em>).
                </p>
              </div>
            )}

            {isUnified ? (
              /* ── Unified view ── */
              <>
                <SearchStatusBar sectionStates={sectionStates} adapters={enabledAdapters} />
                <UnifiedResultList
                  filteredSections={filteredSections}
                  sectionStates={sectionStates}
                  onCopy={copyText}
                  copied={copied}
                  isInLibrary={lib.isInLibrary}
                  onToggleLibrary={lib.toggle}
                  onLoadMoreAll={handleLoadMoreAll}
                  searchKey={searchCount}
                  sortBy={filterState.sortBy}
                />
              </>
            ) : (
              /* ── Source view ── */
              <>
                {withResults.map(adapter => (
                  <SourceSection
                    key={adapter.id}
                    adapter={adapter}
                    state={filteredSections[adapter.id] || {}}
                    onCopy={copyText}
                    copied={copied}
                    isInLibrary={lib.isInLibrary}
                    onToggleLibrary={lib.toggle}
                    onLoadMore={(id) => loadMore(id, query)}
                  />
                ))}

                {/* Zero-result sources — collapsed chip row at bottom */}
                {withoutResults.length > 0 && (
                  <div className="border-t border-stone-200 pt-5">
                    <p className="mono-font text-[9px] uppercase tracking-widest text-stone-400 mb-2">
                      No matches in
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {withoutResults.map(a => (
                        <span
                          key={a.id}
                          className={`mono-font text-[9px] uppercase tracking-widest ${a.color.bg} ${a.color.text} px-2 py-0.5 opacity-30`}
                        >
                          {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* D3 — external launcher prompt on sparse results */}
            {isSparseResults && (
              <p className="mono-font text-[10px] uppercase tracking-widest text-stone-500">
                No API results? These external archives may have what you need ↓
              </p>
            )}
            <LauncherBlock query={query} launchers={LAUNCHERS} />
          </div>
        )}

        {!hasSearched && loaded && (
          <div className="py-12 text-center">
            <p className="display-font italic text-xl text-stone-600 mb-6">
              Type a topic, hit search. Multiple databases at once.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
              {ADAPTERS.map(a => (
                <div key={a.id} className="border border-stone-400 p-3 text-left">
                  <div className={`mono-font text-[10px] uppercase tracking-widest inline-block ${a.color.bg} ${a.color.text} px-2 py-1 mb-2`}>{a.name}</div>
                  <p className="text-xs text-stone-600 leading-relaxed">{a.tagline}</p>
                </div>
              ))}
            </div>
            {!settings.europeanaKey && (
              <p className="mono-font text-[10px] uppercase tracking-widest text-amber-900 mt-6">
                Visit &lsquo;Settings&rsquo; to learn how to enable supplemental sources and custom journals!
              </p>
            )}
          </div>
        )}

        <ConnectCard />
        <Footer />
      </div>

      {showAuthModal && <AuthModal onDismiss={dismissModal} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <KofiOverlay />
      <OpenCITE />
      <Analytics />
      <SpeedInsights />
    </AuthProvider>
  );
}
