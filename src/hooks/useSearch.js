import { useState, useCallback, useRef, useMemo } from "react";
import { ADAPTERS, runSearch } from "../adapters/index.js";
import { doiKey, titleFingerprint, dedupFirstWins } from "../lib/dedup.js";

// v0.44 — engine teardown (sprint D-2): the browser pipeline is raw pass-through +
// streaming dedup. Retrieval order from each source IS the display order; no BM25F
// scoring, no synonym expansion, no confidence gate. Dedup (verdict-HEALTHY in the
// v0.36 diagnostic) is the only post-retrieve step that remains.
export function useSearch(settings, isEnabled) {
  const [sectionStates, setSectionStates] = useState({});
  const [hasSearched, setHasSearched] = useState(false);

  // C1 — cross-adapter DOI dedup + title fingerprint dedup; reset each new search
  const seenDOIs = useRef(new Set());
  const seenTitles = useRef(new Set());

  // F-307 — stale-response guard. Each search() gets a monotonic id; an adapter
  // callback from a superseded search no longer matches the current id and silently
  // discards its result instead of overwriting the new search's loading state.
  const searchIdRef = useRef(0);

  // F-A3 — loadMore must page the query that PRODUCED the current results, not whatever
  // is in the live input box. search() records its executed query here; loadMore reads it.
  const executedQueryRef = useRef("");

  const reset = useCallback(() => {
    setHasSearched(false);
    setSectionStates({});
    seenDOIs.current.clear();
    seenTitles.current.clear();
    searchIdRef.current++; // invalidate any in-flight adapters from the cleared search
  }, []);

  const search = useCallback(async (query) => {
    if (!query.trim()) return;
    setHasSearched(true);
    seenDOIs.current.clear();
    seenTitles.current.clear();
    const thisId = ++searchIdRef.current;
    executedQueryRef.current = query; // F-A3 — pin the query loadMore will page

    // C3 — multi-keyword parsing
    const terms = query.split(";").map(s => s.trim()).filter(Boolean);
    const isMulti = terms.length > 1;

    const activeAdapters = ADAPTERS.filter(isEnabled);

    const initial = {};
    activeAdapters.forEach(a => {
      // pageToken: generic opaque token for token-paginated adapters; undefined for offset-based ones.
      initial[a.id] = { loading: true, results: null, error: null, hasMore: false, loadingMore: false, offset: 0, pageToken: undefined };
    });
    setSectionStates(initial);

    activeAdapters.forEach(async (adapter) => {
      try {
        let results, hasMore, nextPageToken;

        if (isMulti) {
          // C3 — run all terms in parallel per adapter, then merge with a within-batch
          // DOI dedup (the same record often matches several of the user's terms).
          const batches = await Promise.all(
            terms.map(t => runSearch(adapter, t, settings, { offset: 0, pageToken: undefined }))
          );
          const merged = batches.flatMap(b => b.results || []);
          results = dedupFirstWins(merged, doiKey, new Set());
          hasMore = false; // load more not supported for multi-keyword
          nextPageToken = undefined;
        } else {
          ({ results, hasMore, nextPageToken } = await runSearch(adapter, terms[0], settings, { offset: 0, pageToken: undefined }));
        }

        // C1 — cross-adapter dedup: DOI first, then same-paper title fingerprint
        // (catches one work registered under multiple DOIs — e.g. JSTOR + publisher).
        // First-wins streaming: whichever adapter delivers a work first keeps it (D-2).
        const filtered = dedupFirstWins(
          dedupFirstWins(results, doiKey, seenDOIs.current),
          titleFingerprint, seenTitles.current
        );

        if (searchIdRef.current !== thisId) return; // stale — a newer search superseded this one
        setSectionStates(prev => ({
          ...prev,
          // pageToken: stored generically; undefined for offset-based adapters (harmless).
          [adapter.id]: { loading: false, results: filtered, error: null, hasMore, loadingMore: false, offset: filtered.length, pageToken: nextPageToken }
        }));
      } catch (err) {
        if (searchIdRef.current !== thisId) return; // stale — discard the error too
        setSectionStates(prev => ({
          ...prev,
          [adapter.id]: { loading: false, results: null, error: err.message || "Search failed", hasMore: false, loadingMore: false, offset: 0, pageToken: undefined }
        }));
      }
    });
  }, [settings, isEnabled]);

  const loadMore = useCallback(async (adapterId) => {
    const adapter = ADAPTERS.find(a => a.id === adapterId);
    if (!adapter) return;
    const current = sectionStates[adapterId];
    if (!current || current.loadingMore || !current.hasMore) return;

    // F-A4 — stale-guard: capture the search generation this loadMore belongs to. If a
    // new search (or reset) supersedes it mid-flight, discard the response/error instead
    // of writing pages from the OLD query into the NEW search's sections.
    const thisId = searchIdRef.current;

    setSectionStates(prev => ({ ...prev, [adapterId]: { ...prev[adapterId], loadingMore: true } }));

    // F-A3 — page the executed query (recorded by search()), not the live input box.
    const terms = executedQueryRef.current.split(";").map(s => s.trim()).filter(Boolean);

    try {
      // Thread both offset (for offset-based adapters) and pageToken (for token-based adapters,
      // e.g. Rijksmuseum) into the opts object. Adapters that don't use pageToken ignore it.
      const { results: newResults, hasMore, nextPageToken } = await runSearch(
        adapter, terms[0], settings,
        { offset: current.offset, pageToken: current.pageToken }
      );

      // C1 — dedup load-more results against everything already seen (DOI + title fingerprint)
      const filtered = dedupFirstWins(
        dedupFirstWins(newResults, doiKey, seenDOIs.current),
        titleFingerprint, seenTitles.current
      );

      if (searchIdRef.current !== thisId) return; // stale — superseded while fetching (F-A4)
      setSectionStates(prev => {
        const existing = prev[adapterId];
        const combined = [...(existing.results || []), ...filtered];
        // Advance offset for offset-based adapters; store updated pageToken for token-based ones.
        // Both fields coexist safely — offset-based adapters will have nextPageToken=undefined.
        return { ...prev, [adapterId]: { ...existing, results: combined, hasMore, loadingMore: false, offset: combined.length, pageToken: nextPageToken } };
      });
    } catch (err) {
      if (searchIdRef.current !== thisId) return; // stale — discard the error too (F-A4)
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
