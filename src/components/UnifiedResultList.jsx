import React, { useState, useEffect, useMemo } from "react";
import { ResultCard } from "./ResultCard.jsx";
import { BookGroupHeader } from "./BookGroupHeader.jsx";
import { ADAPTERS } from "../adapters/index.js";
import { groupByParentWork } from "../lib/groupResults.js";

const INITIAL_DISPLAY = 20;
const LOAD_STEP = 10;

// Pre-built lookup: adapter ID → adapter object, for source badges
const ADAPTER_MAP = Object.fromEntries(ADAPTERS.map(a => [a.id, a]));

// ---------------------------------------------------------------------------
// UnifiedResultList — ranks all results from all adapters by _score and
// presents them as a single paginated list. Source attribution is shown
// as a colored chip above each card. Book chapters sharing the same container
// title are clustered together under a parent-work header (same as source view).
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
  sortBy,
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
    if (sortBy === "citations") {
      return pool.sort((a, b) => (b.citedBy ?? -1) - (a.citedBy ?? -1));
    } else if (sortBy === "year") {
      return pool.sort((a, b) => parseInt(b.year, 10) - parseInt(a.year, 10));
    }
    // "relevance" or "default" → _score desc, citedBy tie-break
    return pool.sort((a, b) => {
      const scoreDiff = (b._score ?? 0) - (a._score ?? 0);
      if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
      return (b.citedBy ?? 0) - (a.citedBy ?? 0);
    });
  }, [filteredSections, sortBy]);

  // Cluster book chapters under their parent work; non-chapters are solo groups
  const allGroups = useMemo(() => groupByParentWork(allResults), [allResults]);

  // Paginate by group count so a cluster is never split across pages
  const visibleGroups = allGroups.slice(0, displayCount);
  const visibleItemCount = visibleGroups.reduce((sum, g) => sum + g.items.length, 0);

  const hasMoreLocal  = displayCount < allGroups.length;
  // Can we fetch more results from any remote adapter that is actually
  // contributing visible results? An adapter whose hits were all gated out as
  // loose matches shouldn't keep the "more available" prompt alive — fetching
  // more from it just yields more junk that gets filtered, so the button would
  // appear to do nothing. Read from filteredSections (post-gate visible pool).
  const hasMoreRemote = Object.values(filteredSections).some(
    s => s.hasMore && !s.loading && !s.loadingMore && (s.results?.length || 0) > 0
  );
  const anyLoadingMore = Object.values(sectionStates).some(s => s.loadingMore);
  const isInitialLoading = Object.values(sectionStates).some(s => s.loading);

  const handleShowMore = () => {
    const next = displayCount + LOAD_STEP;
    setDisplayCount(next);
    // When local pool is exhausted, trigger a remote fetch
    if (next >= allGroups.length && hasMoreRemote) {
      onLoadMoreAll();
    }
  };

  if (allResults.length === 0 && !isInitialLoading) return null;

  // Global index counter for №01, №02… across all groups
  let globalIndex = 0;

  return (
    <div>
      <div className="space-y-6">
        {visibleGroups.map((group, gi) => {
          // Standalone result — source chip + single card
          if (!group.parentTitle) {
            const r = group.items[0];
            const idx = globalIndex++;
            const adapter = ADAPTER_MAP[r.source];
            return (
              <div key={r.id}>
                {adapter && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`mono-font text-[9px] uppercase tracking-widest ${adapter.color.bg} ${adapter.color.text} px-2 py-0.5`}
                    >
                      {adapter.name}
                    </span>
                    {r._lowConfidence && (
                      <span className="mono-font text-[9px] uppercase tracking-widest text-amber-700 border border-amber-400 px-1.5 py-0.5">
                        loose match
                      </span>
                    )}
                  </div>
                )}
                <ResultCard
                  result={r}
                  index={idx}
                  onCopy={onCopy}
                  copied={copied}
                  isInLibrary={isInLibrary ? isInLibrary(r) : false}
                  onToggleLibrary={onToggleLibrary}
                />
              </div>
            );
          }

          // Grouped book chapters — parent header + per-chapter source chips + indented cards
          return (
            <div key={`group-${gi}-${group.parentTitle}`} className="border border-stone-400 bg-stone-50/20">
              <BookGroupHeader group={group} />

              {/* Chapter cards — source chip per card (may differ across chapters) */}
              <div className="pl-3 pr-1 py-3 space-y-4">
                {group.items.map((r) => {
                  const idx = globalIndex++;
                  const adapter = ADAPTER_MAP[r.source];
                  return (
                    <div key={r.id}>
                      {adapter && (
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`mono-font text-[9px] uppercase tracking-widest ${adapter.color.bg} ${adapter.color.text} px-2 py-0.5`}
                          >
                            {adapter.name}
                          </span>
                          {r._lowConfidence && (
                            <span className="mono-font text-[9px] uppercase tracking-widest text-amber-700 border border-amber-400 px-1.5 py-0.5">
                              loose match
                            </span>
                          )}
                        </div>
                      )}
                      <ResultCard
                        result={r}
                        index={idx}
                        onCopy={onCopy}
                        copied={copied}
                        isInLibrary={isInLibrary ? isInLibrary(r) : false}
                        onToggleLibrary={onToggleLibrary}
                        isChapterInGroup
                      />
                    </div>
                  );
                })}
              </div>
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
            {visibleItemCount} of {allResults.length} loaded
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
