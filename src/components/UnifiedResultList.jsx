import React, { useState, useEffect, useMemo } from "react";
import { ResultCard } from "./ResultCard.jsx";
import { ADAPTERS } from "../adapters/index.js";

const INITIAL_DISPLAY = 20;
const LOAD_STEP = 10;

// Pre-built lookup: adapter ID → adapter object, for source badges
const ADAPTER_MAP = Object.fromEntries(ADAPTERS.map(a => [a.id, a]));

// ---------------------------------------------------------------------------
// UnifiedResultList — ranks all results from all adapters by _score and
// presents them as a single paginated list. Source attribution is shown
// as a colored chip above each card.
//
// Props:
//   filteredSections  — output of useFilters (already filtered/sorted per user prefs)
//   sectionStates     — raw search state (for hasMore / loadingMore signals)
//   onLoadMoreAll     — fires loadMore for every adapter with hasMore:true
//   searchKey         — increments with each new search; resets pagination
// ---------------------------------------------------------------------------

export function UnifiedResultList({
  filteredSections,
  sectionStates,
  onCopy,
  copied,
  isInLibrary,
  onToggleLibrary,
  onLoadMoreAll,
  searchKey,
}) {
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY);

  // Reset to first page on every new search
  useEffect(() => {
    setDisplayCount(INITIAL_DISPLAY);
  }, [searchKey]);

  // Pool and rank across all sections
  const allResults = useMemo(() => {
    const pool = [];
    for (const section of Object.values(filteredSections)) {
      for (const r of section.results || []) {
        pool.push(r);
      }
    }
    // Primary: _score desc. Secondary: citedBy desc (tie-break).
    return pool.sort((a, b) => {
      const scoreDiff = (b._score ?? 0) - (a._score ?? 0);
      if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
      return (b.citedBy ?? 0) - (a.citedBy ?? 0);
    });
  }, [filteredSections]);

  const visibleResults = allResults.slice(0, displayCount);

  // Can we reveal more from the already-loaded pool?
  const hasMoreLocal  = displayCount < allResults.length;
  // Can we fetch more results from any remote adapter?
  const hasMoreRemote = Object.values(sectionStates).some(s => s.hasMore && !s.loading && !s.loadingMore);
  const anyLoadingMore = Object.values(sectionStates).some(s => s.loadingMore);
  const isInitialLoading = Object.values(sectionStates).some(s => s.loading);

  const handleShowMore = () => {
    const next = displayCount + LOAD_STEP;
    setDisplayCount(next);
    // When local pool is exhausted, trigger a remote fetch
    if (next >= allResults.length && hasMoreRemote) {
      onLoadMoreAll();
    }
  };

  if (allResults.length === 0 && !isInitialLoading) return null;

  return (
    <div>
      <div className="space-y-6">
        {visibleResults.map((r, i) => {
          const adapter = ADAPTER_MAP[r.source];
          return (
            <div key={r.id}>
              {/* Source attribution chip — replaces the per-section header from source view */}
              {adapter && (
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`mono-font text-[9px] uppercase tracking-widest ${adapter.color.bg} ${adapter.color.text} px-2 py-0.5`}
                  >
                    {adapter.name}
                  </span>
                </div>
              )}
              <ResultCard
                result={r}
                index={i}
                onCopy={onCopy}
                copied={copied}
                isInLibrary={isInLibrary ? isInLibrary(r) : false}
                onToggleLibrary={onToggleLibrary}
              />
            </div>
          );
        })}
      </div>

      {/* Show more — local pagination first, then remote fetch */}
      {(hasMoreLocal || (hasMoreRemote && !anyLoadingMore)) && !anyLoadingMore && (
        <div className="mt-8 flex items-center gap-4 flex-wrap">
          <button
            onClick={handleShowMore}
            className="mono-font text-[10px] uppercase tracking-widest border border-stone-700 text-stone-700 px-4 py-2 hover:bg-stone-900 hover:text-amber-50 hover:border-stone-900 transition"
          >
            ↓ Show {LOAD_STEP} more
          </button>
          <span className="mono-font text-[9px] text-stone-400">
            {visibleResults.length} of {allResults.length} loaded
            {hasMoreRemote ? " · more available from sources" : ""}
          </span>
        </div>
      )}

      {anyLoadingMore && (
        <div className="mt-6 mono-font text-xs text-stone-500 flex items-center gap-2">
          <span className="pulse-dot">●</span>
          Fetching more results…
        </div>
      )}
    </div>
  );
}
