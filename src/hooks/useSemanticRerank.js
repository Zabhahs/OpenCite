import { useState, useEffect, useRef } from "react";
import { scoreResults } from "../lib/semantic.js";
import { orderBySimilarity } from "../lib/semanticSearch.js";

// OpenCITE — useSemanticRerank (v0.49)
//
// Once every adapter has settled, score every result against the query on-device and hand
// back a copy of sectionStates whose results carry `_sim` and are ordered by it within each
// section. The unified list orders the flat pool by `_sim` (lib/semanticSearch.js R3); the
// source view shows each section already ordered.
//
// Incremental: embeddings are cached per result id for the life of one search, so a
// load-more page embeds only the new rows. A new search (any section back to `loading`)
// clears the cache.
//
// Status: "idle" | "loading-model" | "embedding" | "done" | "error". On error the hook
// returns rerankedStates=null and the app falls back to native order — never a blank screen.
export function useSemanticRerank(sectionStates, query, enabled) {
  const [rerankedStates, setRerankedStates] = useState(null);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(null); // { file, progress } while downloading
  const cacheRef = useRef(new Map());
  const lastSigRef = useRef("");

  // New search → drop everything from the previous one.
  const anyLoading = Object.values(sectionStates).some(s => s.loading);
  useEffect(() => {
    if (anyLoading) {
      cacheRef.current = new Map();
      lastSigRef.current = "";
      setRerankedStates(null);
      setStatus("idle");
      setProgress(null);
    }
  }, [anyLoading]);

  // Toggle off → clear immediately (native order shows on the next render).
  useEffect(() => {
    if (!enabled) { setRerankedStates(null); setStatus("idle"); lastSigRef.current = ""; }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || anyLoading) return;
    const entries = Object.entries(sectionStates);
    const all = entries.flatMap(([, s]) => s.results || []);
    if (!all.length) { setStatus("done"); return; } // nothing to order — release the results gate
    // Signature of the current pool: rerun only when the set of rows changes (load more).
    const sig = all.map(r => r.id).join("|");
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;

    let cancelled = false;
    setStatus(cacheRef.current.size ? "embedding" : "loading-model");
    (async () => {
      try {
        const sims = await scoreResults(query, all, {
          cache: cacheRef.current,
          onProgress: (p) => {
            if (cancelled) return;
            if (p.status === "progress") setProgress({ file: p.file, progress: p.progress });
            if (p.status === "ready" || p.status === "done") { setProgress(null); setStatus("embedding"); }
          },
        });
        if (cancelled) return;
        const simById = new Map(all.map((r, i) => [r.id, sims[i]]));
        const updated = {};
        for (const [id, state] of entries) {
          if (!state.results) { updated[id] = state; continue; }
          const scored = state.results.map(r => ({ ...r, _sim: simById.get(r.id) }));
          updated[id] = { ...state, results: orderBySimilarity(scored) };
        }
        setRerankedStates(updated);
        setStatus("done");
      } catch (err) {
        console.warn("[opencite:semantic] rerank failed — showing native order", err);
        if (!cancelled) { setRerankedStates(null); setStatus("error"); }
      }
    })();
    return () => { cancelled = true; };
  }, [sectionStates, query, enabled, anyLoading]);

  return { rerankedStates, status, progress };
}
