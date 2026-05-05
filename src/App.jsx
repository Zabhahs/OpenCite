import React, { useState, useRef, useEffect, useCallback } from "react";

// Hooks
import { useTheme } from "./hooks/useTheme.js";
import { useSettings } from "./hooks/useSettings.js";
import { useHistory } from "./hooks/useHistory.js";
import { useLibrary } from "./hooks/useLibrary.js";
import { useSearch } from "./hooks/useSearch.js";

// Data
import { ADAPTERS } from "./adapters/index.js";
import { LAUNCHERS } from "./launchers/index.js";
import { HISTORY_MAX } from "./constants/defaults.js";

// Components
import { SearchInput } from "./components/SearchInput.jsx";
import { SourceSection } from "./components/SourceSection.jsx";
import { LauncherBlock } from "./components/LauncherBlock.jsx";
import { Header, Footer, ConnectCard, ThemeStrip } from "./components/Layout.jsx";
import { SettingsPanel, HistoryPanel, LibraryPanel } from "./components/Panels.jsx";

/* ============================================================================
   App.jsx — thin orchestrator.
   All business logic lives in hooks/. All UI lives in components/.
   This file wires them together and owns panel visibility state.
============================================================================ */

function OpenCITE() {
  const [query, setQuery] = useState("");
  const [activePanel, setActivePanel] = useState(null); // "settings" | "history" | "library" | null
  const [copied, setCopied] = useState({ id: null, style: null });
  const inputRef = useRef(null);

  const { themeKey, theme, changeTheme } = useTheme(
    (() => { try { return localStorage.getItem("themeKey"); } catch { return null; } })()
  );
  const { settings, save: saveSettings, load: loadSettings, loaded, isEnabled, toggleAdapter } = useSettings();
  const hist = useHistory();
  const lib = useLibrary();
  const { sectionStates, hasSearched, search, loadMore } = useSearch(settings, isEnabled);

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
  }, [query, search, hist]);

  const handleRerun = useCallback((q) => {
    setQuery(q);
    setActivePanel(null);
    hist.add(q);
    search(q);
  }, [search, hist]);

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
      style={{
        background: theme.bg,
        fontFamily: "'Avenir Next', 'Avenir', 'Mulish', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
        color: theme.fg,
        "--ui-fg": theme.fg, "--ui-fg-muted": theme.fgMuted, "--ui-fg-subtle": theme.fgSubtle,
        "--ui-border": theme.border, "--ui-border-subtle": theme.borderSubtle,
        "--ui-surface": theme.surface, "--ui-accent": theme.accent, "--ui-on-accent": theme.onAccent,
        "--ui-button-bg": theme.buttonBg, "--ui-settings-bg": theme.settingsBg, "--ui-input-bg": theme.inputBg,
        "--ui-grain-opacity": theme.grainOpacity
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
      `}</style>
      <div className="grain" />

      <div className="relative max-w-4xl mx-auto px-6 py-10 md:py-16" style={{ zIndex: 2 }}>
        <Header
          adapters={ADAPTERS}
          onLibrary={() => togglePanel("library")}
          onHistory={() => togglePanel("history")}
          onSettings={() => togglePanel("settings")}
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
            {ADAPTERS.filter(isEnabled).map(adapter => (
              <SourceSection
                key={adapter.id}
                adapter={adapter}
                state={sectionStates[adapter.id] || {}}
                onCopy={copyText}
                copied={copied}
                isInLibrary={lib.isInLibrary}
                onToggleLibrary={lib.toggle}
                onLoadMore={(id) => loadMore(id, query)}
              />
            ))}
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
                ⚙ add your free Europeana key in settings to enable that source
              </p>
            )}
          </div>
        )}

        <ConnectCard />
        <Footer />
      </div>
    </div>
  );
}

// Context providers (AuthProvider, BillingProvider) are stubs — added in Phase 1.
export default function App() {
  return <OpenCITE />;
}
