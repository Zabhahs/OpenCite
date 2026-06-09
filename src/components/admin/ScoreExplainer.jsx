import React, { useState, useCallback } from "react";

// F1 — Score Explainer: paste a query, run a debug search, see ranked results
// with expandable score breakdowns.
export function ScoreExplainer() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);
    setExpandedId(null);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&debug=1&limit=25`);
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const data = await res.json();
      setResults(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const toggleExpanded = useCallback((idx) => {
    setExpandedId(prev => prev === idx ? null : idx);
  }, []);

  return (
    <div className="space-y-6">
      {/* Query input */}
      <div className="space-y-2">
        <label className="mono-font text-xs uppercase tracking-widest text-stone-600">
          Query
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Type a query and press Enter…"
            className="flex-1 px-3 py-2 border border-stone-300 rounded text-sm font-mono"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-4 py-2 bg-stone-900 text-white rounded text-xs font-mono uppercase disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red-300 bg-red-50/60 px-4 py-3 rounded">
          <p className="mono-font text-xs text-red-900">Error: {error}</p>
        </div>
      )}

      {/* Meta info */}
      {results && (
        <div className="border border-stone-200 bg-stone-50/40 px-4 py-3 rounded space-y-2">
          <p className="mono-font text-xs text-stone-700">
            <strong>Results:</strong> {results.results?.length || 0} found
          </p>
          {results.meta?.debug && (
            <>
              <p className="mono-font text-xs text-stone-700">
                <strong>Coverage:</strong> {results.meta.debug.coverage?.rawPercent || 0}% ({results.meta.debug.coverage?.failedCount || 0} failed)
              </p>
              <p className="mono-font text-xs text-stone-700">
                <strong>Dedup:</strong> {results.meta.debug.dedup?.raw || 0} raw → {results.meta.debug.dedup?.afterTitle || 0} after dedup
              </p>
            </>
          )}
        </div>
      )}

      {/* Results list */}
      {results?.results && results.results.length > 0 && (
        <div className="space-y-3">
          <p className="mono-font text-xs uppercase tracking-widest text-stone-600">
            Ranked Results
          </p>
          {(() => {
            // F-201: normalize against the top hit so scores are comparable 0–100.
            const maxScore = results.results[0]?._score || 1;
            return results.results.map((r, idx) => (
              <ScoreCard
                key={idx}
                result={r}
                rank={idx + 1}
                maxScore={maxScore}
                expanded={expandedId === idx}
                onToggleExpanded={() => toggleExpanded(idx)}
              />
            ));
          })()}
        </div>
      )}

      {results?.results && results.results.length === 0 && (
        <div className="border border-amber-300 bg-amber-50/60 px-4 py-3 rounded">
          <p className="mono-font text-xs text-amber-900">No results found for this query.</p>
        </div>
      )}
    </div>
  );
}

// Single expandable score card
function ScoreCard({ result, rank, maxScore = 1, expanded, onToggleExpanded }) {
  const scoreBreakdown = result._scoreBreakdown || {};
  const gateColor = {
    kept: "bg-green-50 border-green-300",
    best_guess: "bg-amber-50 border-amber-300",
    dropped: "bg-red-50 border-red-300",
  }[scoreBreakdown.gateDisposition] || "bg-stone-50 border-stone-300";

  const gateTextColor = {
    kept: "text-green-900",
    best_guess: "text-amber-900",
    dropped: "text-red-900",
  }[scoreBreakdown.gateDisposition] || "text-stone-900";

  return (
    <div className={`border ${gateColor} rounded p-4 space-y-3 cursor-pointer transition`}
         onClick={onToggleExpanded}>
      {/* Header: rank, title, DOI, score */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="mono-font text-xs font-bold text-stone-700">#{rank}</span>
            <span className={`mono-font text-xs px-2 py-1 ${gateTextColor} font-semibold`}>
              {scoreBreakdown.gateDisposition || "?"}
            </span>
          </div>
          <p className="text-sm font-semibold text-stone-900 line-clamp-2">
            {result.title || "Untitled"}
          </p>
          {result.doi && (
            <p className="mono-font text-xs text-stone-600 truncate">
              {result.doi}
            </p>
          )}
          {result.source && (
            <p className="mono-font text-xs text-stone-500">
              Source: {result.source}
            </p>
          )}
        </div>
        <div className="text-right space-y-1">
          <p className="text-lg font-bold text-stone-900">
            {/* F-201: normalized 0–100 (top hit = 100); raw BM25F kept in secondary text. */}
            {Math.round(((result._score ?? 0) / maxScore) * 100)}/100
          </p>
          <p className="mono-font text-xs text-stone-500">
            raw {(result._score ?? 0).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="border-t border-current border-opacity-20 pt-3 space-y-2">
          {/* BM25F per-field */}
          {scoreBreakdown.bm25f && Object.keys(scoreBreakdown.bm25f).length > 0 && (
            <div>
              <p className="mono-font text-xs font-semibold text-stone-700 mb-1">
                BM25F per-field:
              </p>
              <div className="pl-3 space-y-1">
                {Object.entries(scoreBreakdown.bm25f).map(([field, value]) => (
                  <p key={field} className="mono-font text-xs text-stone-600">
                    {field}: <span className="font-semibold">{(value || 0).toFixed(2)}</span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Bonuses */}
          {(scoreBreakdown.phrase || 0) > 0 && (
            <p className="mono-font text-xs text-stone-600">
              Phrase bonus: <span className="font-semibold">{(scoreBreakdown.phrase || 0).toFixed(2)}</span>
            </p>
          )}
          {(scoreBreakdown.thin_source || 0) > 0 && (
            <p className="mono-font text-xs text-stone-600">
              Source bonus: <span className="font-semibold">{(scoreBreakdown.thin_source || 0).toFixed(2)}</span>
            </p>
          )}

          {/* RRF inputs */}
          {scoreBreakdown.rrf_rank && (
            <p className="mono-font text-xs text-stone-600">
              RRF: lex rank {scoreBreakdown.rrf_rank.lex || "—"}, sem rank {scoreBreakdown.rrf_rank.sem || "—"}
            </p>
          )}

          {/* Help text */}
          <p className="mono-font text-[10px] text-stone-500 italic pt-2 border-t border-current border-opacity-10">
            Click to collapse
          </p>
        </div>
      )}
    </div>
  );
}
