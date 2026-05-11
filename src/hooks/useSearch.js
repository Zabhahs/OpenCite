import { useState, useCallback } from "react";
import { ADAPTERS, runSearch } from "../adapters/index.js";

export function useSearch(settings, isEnabled) {
  const [sectionStates, setSectionStates] = useState({});
  const [hasSearched, setHasSearched] = useState(false);

  const reset = useCallback(() => {
    setHasSearched(false);
    setSectionStates({});
  }, []);

  const search = useCallback(async (query) => {
    if (!query.trim()) return;
    setHasSearched(true);

    const activeAdapters = ADAPTERS.filter(isEnabled);

    // Initialise all sections to loading
    const initial = {};
    activeAdapters.forEach(a => {
      initial[a.id] = { loading: true, results: null, error: null, hasMore: false, loadingMore: false, offset: 0 };
    });
    setSectionStates(initial);

    // Fire all adapters in parallel; update each as it resolves
    activeAdapters.forEach(async (adapter) => {
      try {
        const { results, hasMore } = await runSearch(adapter, query, settings, { offset: 0 });
        setSectionStates(prev => ({
          ...prev,
          [adapter.id]: { loading: false, results, error: null, hasMore, loadingMore: false, offset: results.length }
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

    try {
      const { results: newResults, hasMore } = await runSearch(adapter, query, settings, { offset: current.offset });
      setSectionStates(prev => {
        const existing = prev[adapterId];
        const combined = [...(existing.results || []), ...newResults];
        return { ...prev, [adapterId]: { ...existing, results: combined, hasMore, loadingMore: false, offset: combined.length } };
      });
    } catch (err) {
      setSectionStates(prev => ({
        ...prev,
        [adapterId]: { ...prev[adapterId], loadingMore: false, error: err.message || "Couldn't load more" }
      }));
    }
  }, [settings, sectionStates]);

  return { sectionStates, hasSearched, search, loadMore, reset };
}
