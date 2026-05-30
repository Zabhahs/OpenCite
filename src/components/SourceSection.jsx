import React from "react";
import { ResultCard } from "./ResultCard.jsx";
import { groupByParentWork } from "../lib/groupResults.js";

// ---------------------------------------------------------------------------
// SourceSection
// ---------------------------------------------------------------------------

export function SourceSection({ adapter, state, onCopy, copied, isInLibrary, onToggleLibrary, onLoadMore }) {
  const { loading, results, error, hasMore, loadingMore, lowConfidence } = state;

  const groups = !loading && results?.length > 0 ? groupByParentWork(results) : [];

  // Global index counter for №01, №02… across all groups
  let globalIndex = 0;

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
        {!loading && lowConfidence && (
          <span className="mono-font text-[9px] uppercase tracking-widest text-amber-700 border border-amber-400 px-1.5 py-0.5">
            loose match
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

      {!loading && results?.length === 0 && (
        <p className="display-font italic text-stone-600 py-3">No matches in {adapter.name}.</p>
      )}

      {!loading && groups.length > 0 && (
        <div className="space-y-6">
          {groups.map((group, gi) => {
            // Standalone result — no parent header
            if (!group.parentTitle) {
              const r = group.items[0];
              const idx = globalIndex++;
              return (
                <ResultCard
                  key={r.id}
                  result={r}
                  index={idx}
                  onCopy={onCopy}
                  copied={copied}
                  isInLibrary={isInLibrary ? isInLibrary(r) : false}
                  onToggleLibrary={onToggleLibrary}
                />
              );
            }

            // Grouped book chapters — parent header + indented children
            return (
              <div key={`group-${gi}-${group.parentTitle}`} className="border border-stone-400 bg-stone-50/20">
                {/* Parent work header */}
                <div className="px-4 pt-4 pb-3 border-b border-stone-300">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="mono-font text-[9px] uppercase tracking-widest bg-stone-300 text-stone-700 px-2 py-0.5">
                      {group.items.length} chapter{group.items.length !== 1 ? "s" : ""}
                    </span>
                    {group.year && (
                      <span className="mono-font text-[10px] text-stone-500">{group.year}</span>
                    )}
                  </div>
                  <h3
                    className="display-font text-lg font-bold text-stone-900 leading-tight"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {group.parentTitle}
                  </h3>
                  {group.editors?.length > 0 && (
                    <p className="display-font italic text-sm text-stone-600 mt-1">
                      Edited by {group.editors.slice(0, 3).join(", ")}
                      {group.editors.length > 3 ? ", et al." : ""}
                    </p>
                  )}
                  {group.publisher && (
                    <p className="mono-font text-[10px] uppercase tracking-wider text-stone-500 mt-1">
                      {group.publisher}
                    </p>
                  )}
                </div>

                {/* Chapter cards — slightly indented */}
                <div className="pl-3 pr-1 py-3 space-y-4">
                  {group.items.map((r) => {
                    const idx = globalIndex++;
                    return (
                      <ResultCard
                        key={r.id}
                        result={r}
                        index={idx}
                        onCopy={onCopy}
                        copied={copied}
                        isInLibrary={isInLibrary ? isInLibrary(r) : false}
                        onToggleLibrary={onToggleLibrary}
                        isChapterInGroup
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && results?.length > 0 && hasMore && (
        <div className="mt-5">
          <button
            onClick={() => onLoadMore(adapter.id)}
            disabled={loadingMore}
            className="mono-font text-[10px] uppercase tracking-widest border border-stone-700 text-stone-700 px-4 py-2 hover:bg-stone-900 hover:text-amber-50 hover:border-stone-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingMore ? "Loading…" : `↓ Load 5 more from ${adapter.name}`}
          </button>
        </div>
      )}
    </section>
  );
}
