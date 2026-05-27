import React, { useState, useEffect } from "react";

// Compact status bar for unified view — shows which sources are still loading,
// then auto-dismisses 2s after all adapters resolve.
export function SearchStatusBar({ sectionStates, adapters }) {
  const [visible, setVisible] = useState(true);

  const loadingCount  = adapters.filter(a => sectionStates[a.id]?.loading).length;
  const errorCount    = adapters.filter(a => sectionStates[a.id]?.error).length;
  const allSettled    = adapters.length > 0 && adapters.every(a => sectionStates[a.id] && !sectionStates[a.id].loading);

  // Show again whenever a new search starts (adapters go back to loading)
  useEffect(() => {
    if (!allSettled) { setVisible(true); return; }
    const t = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(t);
  }, [allSettled]);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 mb-5 flex-wrap">
      {!allSettled ? (
        <>
          <span className="pulse-dot mono-font text-[9px] text-amber-700">●</span>
          <span className="mono-font text-[9px] uppercase tracking-widest text-stone-500">
            Searching {loadingCount} source{loadingCount !== 1 ? "s" : ""}…
          </span>
        </>
      ) : (
        <>
          <span className="mono-font text-[9px] text-stone-400">✓</span>
          <span className="mono-font text-[9px] uppercase tracking-widest text-stone-400">
            {adapters.length} source{adapters.length !== 1 ? "s" : ""} searched
            {errorCount > 0 && (
              <> · <span className="text-red-700">{errorCount} unavailable</span></>
            )}
          </span>
        </>
      )}
    </div>
  );
}
