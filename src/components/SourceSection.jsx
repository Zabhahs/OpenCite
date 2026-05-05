import React from "react";
import { ResultCard } from "./ResultCard.jsx";

export function SourceSection({ adapter, state, onCopy, copied, isInLibrary, onToggleLibrary, onLoadMore }) {
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

      {!loading && results?.length === 0 && (
        <p className="display-font italic text-stone-600 py-3">No matches in {adapter.name}.</p>
      )}

      {!loading && results?.length > 0 && (
        <div className="space-y-6">
          {results.map((r, i) => (
            <ResultCard
              key={r.id} result={r} index={i}
              onCopy={onCopy} copied={copied}
              isInLibrary={isInLibrary ? isInLibrary(r) : false}
              onToggleLibrary={onToggleLibrary}
            />
          ))}
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
