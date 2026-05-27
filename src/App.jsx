import React, { useState, useRef, useEffect, useCallback } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

// Hooks
import { useTheme } from "./hooks/useTheme.js";
import { useSettings } from "./hooks/useSettings.js";
import { useHistory } from "./hooks/useHistory.js";
import { useLibrary } from "./hooks/useLibrary.js";
import { useSearch } from "./hooks/useSearch.js";
import { useFilters } from "./hooks/useFilters.js";

// Data
import { ADAPTERS } from "./adapters/index.js";
import { LAUNCHERS } from "./launchers/index.js";
import { HISTORY_MAX } from "./constants/defaults.js";

// Components
import { SearchInput } from "./components/SearchInput.jsx";
import { SourceSection } from "./components/SourceSection.jsx";
import { LauncherBlock } from "./components/LauncherBlock.jsx";
import { Header, Footer, ConnectCard, ThemeStrip, KofiOverlay, AuthModal } from "./components/Layout.jsx";
import { SettingsPanel, HistoryPanel, LibraryPanel } from "./components/Panels.jsx";

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
  const [filterState] = useState({});
  const { sectionStates, hasSearched, search, loadMore, reset, isSparseResults } = useSearch(settings, isEnabled);
  const filteredSections = useFilters(sectionStates, filterState);

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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Mulish:ital,wght@0,300..1000;1,300..1000&family=JetBrains+Mono:wght@400;500&display=swap');
        .display-font { font-family: 'Avenir Next','Avenir','Mulish',-apple-system,BlinkMacSystemFont,system-ui,sans-serif; }
        .mono-font { font-family: 'JetBrains Mono', monospace; }
        .grain::before { content:''; position:fixed; inset:0; pointer-events:none; opacity:var(--ui-grain-opacity,0.04); z-index:1; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
        .fade-in { animation: fade 0.5s ease-out; }
        @keyframes fade { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .underline-thick { text-decoration:underline; text-decoration-thickness:2px; text-underline-offset:4px; }
        .pulse-dot { animation: pulse 1.4s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { opacity:0.3; } 50% { opacity:1; } }
        .ticker-track { display:flex; gap:0.5rem; animation:ticker 80s linear infinite; width:max-content; will-change:transform; }
        .ticker-track:hover { animation-play-state:paused; }
        @keyframes ticker { from { transform:translateX(0); } to { transform:translateX(-50%); } }
        .eagle-header { mix-blend-mode:var(--ui-eagle-blend,multiply); filter:drop-shadow(var(--ui-eagle-shadow)); transition:transform 0.2s ease; }
        .eagle-shake { animation: eagle-shake 0.45s ease; }
        @keyframes eagle-shake {
          0%,100% { transform: rotate(0deg) scale(1.1); }
          20%     { transform: rotate(-10deg) scale(1.1); }
          40%     { transform: rotate(9deg) scale(1.1); }
          60%     { transform: rotate(-6deg) scale(1.1); }
          80%     { transform: rotate(5deg) scale(1.1); }
        }
        @keyframes eagleBounce {
          0%,100% { transform: translateY(0) rotate(0deg); }
          25%     { transform: translateY(-6px) rotate(-5deg); }
          75%     { transform: translateY(-3px) rotate(3deg); }
        }
        @keyframes eagleEnter {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        [data-theme="oled"] .text-stone-900,[data-theme="oled"] .text-stone-800 { color:#ffffff; }
        [data-theme="oled"] .text-stone-700,[data-theme="oled"] .text-stone-600 { color:#d0d0d0; }
        [data-theme="oled"] .text-stone-500,[data-theme="oled"] .text-stone-400 { color:#909090; }
        [data-theme="oled"] .text-amber-50  { color:#000000; }
        [data-theme="oled"] .text-amber-900 { color:#fbbf24; }
        [data-theme="oled"] .text-red-900   { color:#f87171; }
        [data-theme="oled"] .hover\:text-red-900:hover { color:#ef4444; }
        [data-theme="oled"] .app-title:hover { color:#fca5a5; }
        [data-theme="oled"] .placeholder-stone-400::placeholder { color:#555555; }
        [data-theme="oled"] .bg-white,[data-theme="oled"] .bg-amber-50 { background-color:#111111; }
        [data-theme="oled"] .bg-stone-50\/40 { background-color:rgba(20,20,20,0.6); }
        [data-theme="oled"] .bg-stone-50    { background-color:#111111; }
        [data-theme="oled"] .bg-stone-700   { background-color:#2a2a2a; }
        [data-theme="oled"] .bg-stone-900   { background-color:#e8e8e8; }
        [data-theme="oled"] .hover\:bg-stone-900:hover { background-color:#cccccc; }
        [data-theme="oled"] .hover\:bg-red-900:hover   { background-color:#333333; }
        [data-theme="oled"] .border-stone-900 { border-color:#ffffff; }
        [data-theme="oled"] .border-stone-400 { border-color:#444444; }
        [data-theme="oled"] .border-stone-300 { border-color:#333333; }
        [data-theme="oled"] .border-stone-200 { border-color:#2a2a2a; }
        [data-theme="oled"] .focus\:border-red-900:focus { border-color:#ef4444; }
      `}</style>
      <div className="grain" />

      <div className="relative max-w-4xl mx-auto px-6 py-10 md:py-16" style={{ zIndex: 2 }}>
        <Header
          adapters={ADAPTERS}
          onLibrary={() => togglePanel("library")}
          onHistory={() => togglePanel("history")}
          onSettings={() => togglePanel("settings")}
          onLogoClick={handleLogoClick}
          libraryCount={lib.items.length}
          historyCount={hist.entries.length}
          activePanel={activePanel}
        />

        {activePanel === "library" && (
          <LibraryPanel
            items={lib.items}
            onToggle={lib.toggle}
            onExport={lib.exportBibliography}
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

        <ThemeStrip themeKey={themeKey} onChange={changeTheme} />

        <SearchInput
          query={query}
          onChange={setQuery}
          onSearch={handleSearch}
          inputRef={inputRef}
        />

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
            {ADAPTERS.filter(isEnabled).map(adapter => (
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
