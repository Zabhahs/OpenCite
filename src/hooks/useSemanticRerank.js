import { useState, useEffect, useRef } from "react";
import { computeSemanticRanks } from "../lib/semantic.js";
import { fuseRanks } from "../lib/rrf.js";

export function useSemanticRerank(sectionStates, query, enabled) {
  const [rerankedStates, setRerankedStates] = useState(null);
  const [rerankStatus, setRerankStatus] = useState("idle");
  const didRerankRef = useRef(false);
  const queryRef = useRef(query);
  queryRef.current = query;

  // Reset when new search starts (any section loading)
  useEffect(() => {
    if (Object.values(sectionStates).some(s => s.loading)) {
      setRerankedStates(null);
      setRerankStatus("idle");
      didRerankRef.current = false;
    }
  }, [sectionStates]);

  // Reset when toggle changes
  useEffect(() => {
    didRerankRef.current = false;
    if (!enabled) { setRerankedStates(null); setRerankStatus("idle"); }
  }, [enabled]);

  // Rerank once all adapters settle
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

        const semanticRanks = await computeSemanticRanks(queryRef.current, allResults);
        if (cancelled) return;

        const fused = fuseRanks(allResults, [
          { ranks: lexicalRanks, weight: 0.6 },
          { ranks: semanticRanks, weight: 0.4 },
        ]);

        let i = 0;
        const updated = {};
        for (const [id, state] of entries) {
          if (!state.results) { updated[id] = state; continue; }
          const count = state.results.length;
          updated[id] = { ...state, results: fused.slice(i, i + count) };
          i += count;
        }

        if (!cancelled) {
          setRerankedStates(updated);
          setRerankStatus("done");
        }
      } catch (err) {
        console.warn("[opencite:semantic] rerank failed, falling back to BM25F", err);
        if (!cancelled) {
          didRerankRef.current = false;
          setRerankStatus("idle");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [sectionStates, enabled]);

  return { rerankedStates, rerankStatus };
}
