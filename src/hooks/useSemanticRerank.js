import { useState, useEffect, useRef } from "react";
import { computeSemanticRanks } from "../lib/semantic.js";
import { fuseRanks, buildNativeRanks, nativeWeight } from "../lib/rrf.js";
import { ADAPTERS } from "../adapters/index.js";

// Source id → capability, so the fusion can read each result's nativeRelevance descriptor
// (v0.35). Built once; the registry is static.
const CAP_BY_SOURCE = Object.fromEntries(ADAPTERS.map((a) => [a.id, a.capability]));

// Two-phase reranking:
//   Expensive effect — embeds the query + corpus once a search settles, caching the
//     lexical/semantic rank maps. Runs only when the result set changes (guarded by
//     didRerankRef), never on a slider drag.
//   Cheap effect — re-fuses the cached rank maps whenever `semanticWeight` (or the
//     cached inputs) change. Pure arithmetic, so dragging the Lexical↔Semantic slider
//     reorders instantly with no re-fetch and no re-embed.
// `semanticWeight` ∈ [0,1]: 0 = pure lexical (BM25F), 1 = pure semantic, default 0.4.
export function useSemanticRerank(sectionStates, query, enabled, semanticWeight = 0.4) {
  const [rerankedStates, setRerankedStates] = useState(null);
  const [rerankStatus, setRerankStatus] = useState("idle");
  // Cached fusion inputs from the expensive pass; null until embeddings are ready.
  const [fusionInputs, setFusionInputs] = useState(null);
  const didRerankRef = useRef(false);
  const queryRef = useRef(query);
  queryRef.current = query;

  // Reset when new search starts (any section loading) — also clears cached ranks (R2).
  useEffect(() => {
    if (Object.values(sectionStates).some(s => s.loading)) {
      setRerankedStates(null);
      setRerankStatus("idle");
      setFusionInputs(null);
      didRerankRef.current = false;
    }
  }, [sectionStates]);

  // Reset when toggle changes
  useEffect(() => {
    didRerankRef.current = false;
    if (!enabled) {
      setRerankedStates(null);
      setRerankStatus("idle");
      setFusionInputs(null);
    }
  }, [enabled]);

  // ── Expensive: embed + build rank maps once all adapters settle ──
  useEffect(() => {
    if (!enabled || didRerankRef.current) return;

    const entries = Object.entries(sectionStates);
    if (!entries.length) return;
    if (entries.some(([, s]) => s.loading)) return;

    const allResults = entries.flatMap(([, s]) => s.results || []);
    if (allResults.length === 0) return;

    let cancelled = false;
    didRerankRef.current = true;
    setRerankStatus("reranking");

    (async () => {
      try {
        const lexSorted = allResults
          .map((r, i) => [i, r._score ?? 0])
          .sort((a, b) => b[1] - a[1]);
        const lexicalRanks = new Map();
        lexSorted.forEach(([idx], rank) => lexicalRanks.set(idx, rank + 1));

        // v0.35 (D3): native upstream relevance as a third fusion input — each result's
        // position in its own source's full-corpus relevance order. Cached alongside the
        // lexical/semantic maps so the slider re-fuses without recomputing.
        const nativeRanks = buildNativeRanks(allResults, (r) => CAP_BY_SOURCE[r.source]);

        const semanticRanks = await computeSemanticRanks(queryRef.current, allResults);
        if (cancelled) return;

        // Snapshot the section shape (id → state → count) so the cheap effect can
        // re-slice the fused list back into sections without re-reading sectionStates.
        const shape = entries.map(([id, state]) => [id, state, state.results ? state.results.length : 0]);

        // Hand off to the cheap effect; it performs the actual fuse (incl. first paint).
        setFusionInputs({ allResults, lexicalRanks, semanticRanks, nativeRanks, shape });
      } catch (err) {
        console.warn("[opencite:semantic] rerank failed, falling back to BM25F", err);
        if (!cancelled) {
          // Terminal: leave didRerankRef set so we don't loop, and signal "error" so
          // the results gate stops waiting and reveals the BM25F order (rerankedStates
          // stays null → effectiveStates falls back to sectionStates).
          setRerankStatus("error");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [sectionStates, enabled]);

  // ── Cheap: re-fuse instantly whenever the weight (or cached inputs) change ──
  useEffect(() => {
    if (!fusionInputs) return;
    const { allResults, lexicalRanks, semanticRanks, nativeRanks, shape } = fusionInputs;
    const w = Math.min(1, Math.max(0, semanticWeight ?? 0.4));

    // v0.35 — three-input fusion (§6 end-state): native gets a pool-size-weighted share
    // (degenerate IDF on a micro-pool ⇒ lean on the full-corpus native order); the slider's
    // lexical↔semantic balance splits the REMAINDER, so the control keeps its exact meaning.
    // At w=0 this is native+lexical (mirrors the /api/search path); at w=1, native+semantic.
    const wNative = nativeRanks && nativeRanks.size ? nativeWeight(allResults.length) : 0;
    const rest = 1 - wNative;

    const fused = fuseRanks(allResults, [
      { ranks: nativeRanks ?? new Map(), weight: wNative },
      { ranks: lexicalRanks, weight: rest * (1 - w) },
      { ranks: semanticRanks, weight: rest * w },
    ]);

    let i = 0;
    const updated = {};
    for (const [id, state, count] of shape) {
      if (!state.results) { updated[id] = state; continue; }
      updated[id] = { ...state, results: fused.slice(i, i + count) };
      i += count;
    }
    setRerankedStates(updated);
    setRerankStatus("done");
  }, [fusionInputs, semanticWeight]);

  return { rerankedStates, rerankStatus };
}
