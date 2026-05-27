import { useState, useCallback, useRef, useMemo } from "react";
import { ADAPTERS, runSearch } from "../adapters/index.js";
import { scoreResult } from "../lib/scoring.js";

export function useSearch(settings, isEnabled) {
  const [sectionStates, setSectionStates] = useState({});
  const [hasSearched, setHasSearched] = useState(false);

  // C1 — cross-adapter DOI dedup; reset each new search
  const seenDOIs = useRef(new Set());

  const reset = useCallback(() => {
    setHasSearched(false);
    setSectionStates({});
    seenDOIs.current.clear();
  }, []);

  const search = useCallback(async (query) => {
    if (!query.trim()) return;
    setHasSearched(true);
    seenDOIs.current.clear();

    // C3 — multi-keyword parsing
    const terms = query.split(";").map(s => s.trim()).filter(Boolean);
    const isMulti = terms.length > 1;

    const activeAdapters = ADAPTERS.filter(isEnabled);

    const initial = {};
    activeAdapters.forEach(a => {
      initial[a.id] = { loading: true, results: null, error: null, hasMore: false, loadingMore: false, offset: 0 };
    });
    setSectionStates(initial);

    activeAdapters.forEach(async (adapter) => {
      try {
        let results, hasMore;

        if (isMulti) {
          // C3 — run all terms in parallel per adapter, then merge
          const batches = await Promise.all(
            terms.map(t => runSearch(adapter, t, settings, { offset: 0 }))
          );
          const merged = batches.flatMap(b => b.results || []);
          // C1 — dedup within merged batch by DOI
          const seen = new Set();
          results = merged.filter(r => {
            if (!r.doi) return true;
            if (seen.has(r.doi)) return false;
            seen.add(r.doi);
            return true;
          });
          hasMore = false; // load more not supported for multi-keyword
        } else {
          ({ results, hasMore } = await runSearch(adapter, terms[0], settings, { offset: 0 }));
        }

        // C1 — cross-adapter DOI dedup
        const deduped = results.filter(r => {
          if (!r.doi) return true;
          if (seenDOIs.current.has(r.doi)) return false;
          seenDOIs.current.add(r.doi);
          return true;
        });

        // C4 — attach relevance score
        const scored = deduped.map(r => ({ ...r, _score: scoreResult(r, terms) }));

        setSectionStates(prev => ({
          ...prev,
          [adapter.id]: { loading: false, results: scored, error: null, hasMore, loadingMore: false, offset: scored.length }
        }));
      } catch (err) {
        setSectionStates(prev => ({
          ...prev,
          [adapter.id]: { loading: false, results: null, error: err.message || "Search failed", hasMore: false, loadingMore: false, offset: 0 }
        }));
      }
    });
  }, [settings, isEnabled]);

  const loadMore = useCallback(async (adapterId, query) => {
    const adapter = ADAPTERS.find(a => a.id === adapterId);
    if (!adapter) return;
    const current = sectionStates[adapterId];
    if (!current || current.loadingMore || !current.hasMore) return;

    setSectionStates(prev => ({ ...prev, [adapterId]: { ...prev[adapterId], loadingMore: true } }));

    const terms = query.split(";").map(s => s.trim()).filter(Boolean);

    try {
      const { results: newResults, hasMore } = await runSearch(adapter, terms[0], settings, { offset: current.offset });

      // C1 — dedup load-more results against already-seen DOIs
      const deduped = newResults.filter(r => {
        if (!r.doi) return true;
        if (seenDOIs.current.has(r.doi)) return false;
        seenDOIs.current.add(r.doi);
        return true;
      });

      // C4 — score load-more results
      const scored = deduped.map(r => ({ ...r, _score: scoreResult(r, terms) }));

      setSectionStates(prev => {
        const existing = prev[adapterId];
        const combined = [...(existing.results || []), ...scored];
        return { ...prev, [adapterId]: { ...existing, results: combined, hasMore, loadingMore: false, offset: combined.length } };
      });
    } catch (err) {
      setSectionStates(prev => ({
        ...prev,
        [adapterId]: { ...prev[adapterId], loadingMore: false, error: err.message || "Couldn't load more" }
      }));
    }
  }, [settings, sectionStates]);

  // D2 + D3 — sparse results signal: all adapters done and total results < 5
  const isSparseResults = useMemo(() => {
    const sections = Object.values(sectionStates);
    if (!sections.length) return false;
    const allDone = sections.every(s => !s.loading);
    if (!allDone) return false;
    const total = sections.reduce((n, s) => n + (s.results?.length || 0), 0);
    return total < 5;
  }, [sectionStates]);

  return { sectionStates, hasSearched, search, loadMore, reset, isSparseResults };
}
