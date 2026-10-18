// OpenCITE — useSearchTelemetry (sprint v0.50)
//
// Sends the search log beacon exactly when the user SEES results: `resultsReady` (every adapter
// settled + the v0.49 reranker done) is the gate, so the logged order is the order on screen, not
// an intermediate state. The order is rebuilt here with the SAME SSOT UnifiedResultList uses
// (lib/semanticSearch.js: orderBySimilarity when the pool is scored, else interleaveLists), so the
// rank in the log is the rank the user saw. Load-more pages fire again with `page: n`. The page-dwell
// clock is flushed on the next search / reset. Honors settings.telemetry (defaults.js).
//
// Rank note: ranks are positions in the flat ordered pool BEFORE facet filters and before
// groupResults folds editions/chapters, i.e. the default view with no filters. Good enough for a
// reranker; filter state is in the settings snapshot if ever needed.

import { useEffect, useRef } from "react";
import { interleaveLists, hasSemanticOrder, orderBySimilarity } from "../lib/semanticSearch.js";
import { sendSearchEvent, flushPageDwell, setTelemetryEnabled, ensureTelemetryListeners } from "../lib/telemetry.js";

export function useSearchTelemetry({ enabled, hasSearched, resultsReady, executedQuery, query, sectionStates, settings, enabledAdapters, searchCount, sortBy }) {
  const logged = useRef({ searchCount: -1, poolSize: 0, page: 0, startedAt: 0 });

  // Toggle + unload listener.
  useEffect(() => { setTelemetryEnabled(enabled !== false); if (enabled !== false) ensureTelemetryListeners(); }, [enabled]);

  // Stamp the start of each search so tookMs is "search → results visible".
  useEffect(() => {
    if (searchCount !== logged.current.searchCount) logged.current.startedAt = Date.now();
  }, [searchCount]);

  // Leaving the results (reset) → flush the page dwell for the event we logged.
  useEffect(() => { if (!hasSearched) flushPageDwell("reset"); }, [hasSearched]);

  useEffect(() => {
    if (!enabled || !hasSearched || !resultsReady) return;
    const lists = enabledAdapters.map((a) => sectionStates[a.id]?.results || []).filter((l) => l.length > 0);
    const flat = lists.flat();
    const poolSize = flat.length;
    const isNewSearch = searchCount !== logged.current.searchCount;
    const grew = !isNewSearch && poolSize > logged.current.poolSize;
    if (!isNewSearch && !grew) return;

    if (isNewSearch) flushPageDwell("next"); // previous event's page dwell ends here
    const page = isNewSearch ? 0 : logged.current.page + 1;
    logged.current = { searchCount, poolSize, page, startedAt: logged.current.startedAt };

    const ordered = hasSemanticOrder(flat) ? orderBySimilarity(flat) : interleaveLists(lists);
    const failed = enabledAdapters.filter((a) => sectionStates[a.id]?.error).map((a) => a.id);
    void sendSearchEvent({
      query: (query || executedQuery || "").trim() || executedQuery,
      executedQuery,
      settings: { ...settings, sortBy: sortBy || "default" },
      eligible: enabledAdapters.map((a) => a.id),
      failed,
      records: ordered,
      page,
      tookMs: isNewSearch && logged.current.startedAt ? Date.now() - logged.current.startedAt : null,
    });
  }, [enabled, hasSearched, resultsReady, sectionStates, searchCount]); // eslint-disable-line react-hooks/exhaustive-deps
}
