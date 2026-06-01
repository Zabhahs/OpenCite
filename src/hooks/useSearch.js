import { useState, useCallback, useRef, useMemo } from "react";
import { ADAPTERS, runSearch } from "../adapters/index.js";
import { scoreResults, meaningfulTerms, applyConfidenceGate } from "../lib/scoring.js";
import { doiKey, titleFingerprint, dedupFirstWins } from "../lib/dedup.js";
import { expandTerms } from "../lib/synonyms.js";

export function useSearch(settings, isEnabled) {
  const [sectionStates, setSectionStates] = useState({});
  const [hasSearched, setHasSearched] = useState(false);

  // C1 — cross-adapter DOI dedup + title fingerprint dedup; reset each new search
  const seenDOIs = useRef(new Set());
  const seenTitles = useRef(new Set());

  const reset = useCallback(() => {
    setHasSearched(false);
    setSectionStates({});
    seenDOIs.current.clear();
    seenTitles.current.clear();
  }, []);

  const search = useCallback(async (query) => {
    if (!query.trim()) return;
    setHasSearched(true);
    seenDOIs.current.clear();
    seenTitles.current.clear();

    // v0.36 — raw diagnostic mode: skip dedup/score/gate, show adapter output as-is.
    const simple = !!settings.simpleSearch;

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
          // C3 — run all terms in parallel per adapter, then merge. Within-batch dedup is
          // skipped in simple mode (raw passthrough).
          const batches = await Promise.all(
            terms.map(t => runSearch(adapter, t, settings, { offset: 0, pageToken: undefined }))
          );
          const merged = batches.flatMap(b => b.results || []);
          results = simple ? merged : dedupFirstWins(merged, doiKey, new Set());
          hasMore = false; // load more not supported for multi-keyword
          nextPageToken = undefined;
        } else {
          ({ results, hasMore, nextPageToken } = await runSearch(adapter, terms[0], settings, { offset: 0, pageToken: undefined }));
        }

        let filtered, lowConfidence;
        if (simple) {
          // v0.36 — raw: no cross-adapter dedup, no score, no confidence gate.
          filtered = results;
          lowConfidence = undefined;
        } else {
          // C1 — cross-adapter dedup: DOI first, then same-paper title fingerprint
          // (catches one work registered under multiple DOIs — e.g. JSTOR + publisher).
          const deduped = dedupFirstWins(
            dedupFirstWins(results, doiKey, seenDOIs.current),
            titleFingerprint, seenTitles.current
          );

          // C4 — BM25F relevance scoring with optional synonym expansion.
          // v.29 Sprint 2 — pass the adapter's capability so the scorer can gate the citation
          // tiebreak and apply the thin-source prior (batch is homogeneous → constant capability).
          const scoringTerms = await expandTerms(terms, settings.synonyms);
          const scored = scoreResults(deduped, scoringTerms, () => adapter.capability);
          ({ results: filtered, lowConfidence } = applyConfidenceGate(scored, meaningfulTerms(scoringTerms)));
        }

        setSectionStates(prev => ({
          ...prev,
          // pageToken: stored generically; undefined for offset-based adapters (harmless).
          [adapter.id]: { loading: false, results: filtered, lowConfidence, error: null, hasMore, loadingMore: false, offset: filtered.length, pageToken: nextPageToken }
        }));
      } catch (err) {
        setSectionStates(prev => ({
          ...prev,
          [adapter.id]: { loading: false, results: null, error: err.message || "Search failed", hasMore: false, loadingMore: false, offset: 0, pageToken: undefined }
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
      // Thread both offset (for offset-based adapters) and pageToken (for token-based adapters,
      // e.g. Rijksmuseum) into the opts object. Adapters that don't use pageToken ignore it.
      const { results: newResults, hasMore, nextPageToken } = await runSearch(
        adapter, terms[0], settings,
        { offset: current.offset, pageToken: current.pageToken }
      );

      let filtered;
      if (settings.simpleSearch) {
        // v0.36 — raw passthrough: no dedup/score/gate on load-more either.
        filtered = newResults;
      } else {
        // C1 — dedup load-more results against everything already seen (DOI + title fingerprint)
        const deduped = dedupFirstWins(
          dedupFirstWins(newResults, doiKey, seenDOIs.current),
          titleFingerprint, seenTitles.current
        );

        // C4 — BM25F score load-more results (capability-aware, per Sprint 2), then gate so
        // loose matches stay flagged _lowConfidence and don't slip past the unified-view filter.
        const scoringTerms = await expandTerms(terms, settings.synonyms);
        const scored = scoreResults(deduped, scoringTerms, () => adapter.capability);
        ({ results: filtered } = applyConfidenceGate(scored, meaningfulTerms(scoringTerms)));
      }

      setSectionStates(prev => {
        const existing = prev[adapterId];
        const combined = [...(existing.results || []), ...filtered];
        // Advance offset for offset-based adapters; store updated pageToken for token-based ones.
        // Both fields coexist safely — offset-based adapters will have nextPageToken=undefined.
        return { ...prev, [adapterId]: { ...existing, results: combined, hasMore, loadingMore: false, offset: combined.length, pageToken: nextPageToken } };
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
