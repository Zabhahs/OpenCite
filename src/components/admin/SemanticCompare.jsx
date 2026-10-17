import React, { useState, useCallback, useMemo } from "react";
import { compareQuery, compactRun } from "../../lib/semanticCompare.js";
import { aggregateMetrics } from "../../lib/goldSetMetrics.js";
import { storage } from "../../lib/storage.js";
import { history } from "../../lib/history.js";
import { MODEL_ID } from "../../lib/semantic.js";

// v0.49 — Semantic A/B harness (admin console tab)
//
// Bulk-runs a query list through BOTH arms of the browser pipeline — baseline (toggle off)
// and semantic (toggle on) — and compares them. The query list defaults to the union of the
// gold set (labeled → nDCG/MRR/recall per arm) and this browser's own search history
// (unlabeled → top-10 side by side + overlap). Any list can be pasted in, one query per line.
// Runs are kept in localStorage (opencite:semantic_ab_runs) and exportable as JSON.
//
// NOTE: there is no server-side query log (searches are never stored off-device), so
// "stored user searches" here means the admin's own local history + the gold set.

const RUNS_KEY = "semantic_ab_runs";
const fmt = (n) => (typeof n === "number" ? n.toFixed(3) : "—");
const delta = (a, b) => (typeof a === "number" && typeof b === "number" ? b - a : null);
const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);

function loadDefaultQueries() {
  const gold = storage.get("gold_queries", []);
  const goldQs = Array.isArray(gold) ? gold.map(g => g.query) : [];
  const histQs = history.load().map(h => h.query);
  return [...new Set([...goldQs, ...histQs])];
}

export function SemanticCompare({ settings, isEnabled }) {
  const [text, setText] = useState(() => loadDefaultQueries().join("\n"));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null); // "3 / 12" or model download text
  const [run, setRun] = useState(null);
  const [runs, setRuns] = useState(() => { const r = storage.get(RUNS_KEY, []); return Array.isArray(r) ? r : []; });

  const labelsByQuery = useMemo(() => {
    const gold = storage.get("gold_queries", []);
    return Object.fromEntries((Array.isArray(gold) ? gold : []).map(g => [g.query, g.labels || {}]));
  }, []);

  const queries = useMemo(() => text.split("\n").map(s => s.trim()).filter(Boolean), [text]);

  const handleRun = useCallback(async () => {
    if (!queries.length || running) return;
    setRunning(true);
    const entries = [];
    try {
      for (let i = 0; i < queries.length; i++) {
        setProgress(`${i + 1} / ${queries.length}`);
        const q = queries[i];
        const entry = await compareQuery(q, settings, isEnabled, labelsByQuery[q], (p) => {
          if (p.status === "progress") setProgress(`Downloading model · ${Math.round(p.progress || 0)}%`);
        });
        entries.push(compactRun(entry));
        // Be polite to the sources: 4 core adapters × 2 arms per query is already a burst.
        await new Promise(r => setTimeout(r, 400));
      }
      const labeled = entries.filter(e => e.labeled);
      const n = entries.length || 1;
      const result = {
        timestamp: new Date().toISOString(),
        model: MODEL_ID,
        adapters: Object.keys(entries[0]?.baseline.perAdapter || {}),
        count: entries.length,
        labeledCount: labeled.length,
        aggregate: labeled.length ? {
          baseline: aggregateMetrics(labeled.map(e => e.baseline.metrics)),
          semantic: aggregateMetrics(labeled.map(e => e.semantic.metrics)),
        } : null,
        avgOverlap10: entries.reduce((s, e) => s + e.overlap10, 0) / n,
        avgMs: {
          baseline: entries.reduce((s, e) => s + e.baseline.ms, 0) / n,
          semantic: entries.reduce((s, e) => s + e.semantic.ms, 0) / n,
          rerank: entries.reduce((s, e) => s + e.semantic.rerankMs, 0) / n,
        },
        entries,
      };
      setRun(result);
      const next = [result, ...runs].slice(0, 10);
      setRuns(next);
      storage.set(RUNS_KEY, next);
    } catch (e) {
      alert(`A/B run failed: ${e.message}`);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [queries, running, settings, isEnabled, labelsByQuery, runs]);

  const handleExport = useCallback(() => {
    if (!run) return;
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `semantic-ab-${run.timestamp.replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [run]);

  const handleClear = useCallback(() => {
    if (!confirm("Clear stored A/B runs?")) return;
    setRuns([]); setRun(null); storage.set(RUNS_KEY, []);
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="mono-font text-xs uppercase tracking-widest text-stone-600">
          Queries — one per line (prefilled: gold set + this browser&apos;s history)
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="w-full px-3 py-2 border border-stone-300 rounded text-sm font-mono"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleRun}
            disabled={running || !queries.length}
            className="px-4 py-2 bg-stone-900 text-white rounded text-xs font-mono uppercase disabled:opacity-50"
          >
            {running ? `Running ${progress || ""}` : `Run A/B on ${queries.length} ${queries.length === 1 ? "query" : "queries"}`}
          </button>
          <button onClick={() => setText(loadDefaultQueries().join("\n"))} className="text-xs text-stone-600 underline">
            Reload defaults
          </button>
          <span className="mono-font text-[10px] text-stone-500">
            Sources: enabled adapters · both arms run in this browser · labeled queries get nDCG/MRR/recall
          </span>
        </div>
      </div>

      {run && <RunSummary run={run} onExport={handleExport} onClear={handleClear} />}

      {runs.length > 0 && !run && (
        <div className="space-y-2">
          <p className="mono-font text-xs uppercase tracking-widest text-stone-600">Previous runs ({runs.length})</p>
          {runs.map((r, i) => (
            <button key={i} onClick={() => setRun(r)} className="block text-left border border-stone-200 rounded p-2 w-full hover:bg-stone-50">
              <span className="mono-font text-xs text-stone-700">{new Date(r.timestamp).toLocaleString()}</span>
              <span className="mono-font text-xs text-stone-500"> · {r.count} queries · {r.labeledCount} labeled
                {r.aggregate ? ` · nDCG@10 ${fmt(r.aggregate.baseline.avgNDCG10)} → ${fmt(r.aggregate.semantic.avgNDCG10)}` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, a, b }) {
  const d = delta(a, b);
  return (
    <tr>
      <td className="pr-4 py-0.5 text-stone-600">{label}</td>
      <td className="pr-4 py-0.5 text-right">{fmt(a)}</td>
      <td className="pr-4 py-0.5 text-right font-semibold">{fmt(b)}</td>
      <td className={`py-0.5 text-right ${d > 0 ? "text-green-700" : d < 0 ? "text-red-700" : "text-stone-500"}`}>
        {d === null ? "" : `${d > 0 ? "+" : ""}${(d * 100).toFixed(1)} pts`}
      </td>
    </tr>
  );
}

function RunSummary({ run, onExport, onClear }) {
  const agg = run.aggregate;
  return (
    <div className="border border-stone-300 bg-stone-50/60 rounded p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-bold text-stone-900">A/B — baseline vs semantic</h4>
        <p className="mono-font text-xs text-stone-600">
          {new Date(run.timestamp).toLocaleString()} · {run.count} queries · {run.labeledCount} labeled · {run.model}
        </p>
      </div>

      <table className="mono-font text-xs">
        <thead>
          <tr className="text-stone-500"><th></th><th className="text-right pr-4">Baseline</th><th className="text-right pr-4">Semantic</th><th className="text-right">Δ</th></tr>
        </thead>
        <tbody>
          {agg && (
            <>
              <MetricRow label="Avg nDCG@10"   a={agg.baseline.avgNDCG10}   b={agg.semantic.avgNDCG10} />
              <MetricRow label="Avg MRR"       a={agg.baseline.avgMRR}      b={agg.semantic.avgMRR} />
              <MetricRow label="Avg Recall@10" a={agg.baseline.avgRecall10} b={agg.semantic.avgRecall10} />
              <MetricRow label="Avg Recall@20" a={agg.baseline.avgRecall20} b={agg.semantic.avgRecall20} />
            </>
          )}
          <tr>
            <td className="pr-4 py-0.5 text-stone-600">Avg top-10 overlap</td><td></td>
            <td className="text-right pr-4 font-semibold">{run.avgOverlap10.toFixed(1)} / 10</td><td></td>
          </tr>
          <tr>
            <td className="pr-4 py-0.5 text-stone-600">Avg time (ms)</td>
            <td className="text-right pr-4">{Math.round(run.avgMs.baseline)}</td>
            <td className="text-right pr-4 font-semibold">{Math.round(run.avgMs.semantic)}</td>
            <td className="text-right text-stone-500">rerank {Math.round(run.avgMs.rerank)}</td>
          </tr>
        </tbody>
      </table>
      {!agg && (
        <p className="mono-font text-[10px] text-stone-500">
          No labeled queries in this run — add gold queries (Gold-Set tab) to get nDCG/MRR/recall.
        </p>
      )}

      <div className="space-y-3">
        <p className="mono-font text-xs uppercase tracking-widest text-stone-700">Per query</p>
        {run.entries.map((e, i) => <QueryDiff key={i} e={e} />)}
      </div>

      <div className="flex gap-4">
        <button onClick={onExport} className="text-xs text-stone-700 underline">Export JSON</button>
        <button onClick={onClear} className="text-xs text-red-600 hover:text-red-800">Clear stored runs</button>
      </div>
    </div>
  );
}

function QueryDiff({ e }) {
  const [open, setOpen] = useState(false);
  const m = e.labeled
    ? `nDCG ${fmt(e.baseline.metrics.nDCG10)} → ${fmt(e.semantic.metrics.nDCG10)} · MRR ${fmt(e.baseline.metrics.MRR)} → ${fmt(e.semantic.metrics.MRR)}`
    : "unlabeled";
  const errs = [...new Set([...Object.keys(e.baseline.errors || {}), ...Object.keys(e.semantic.errors || {})])];
  return (
    <div className="border border-stone-200 rounded p-2 space-y-1">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left">
        <p className="text-xs font-semibold text-stone-900">{open ? "▾" : "▸"} {e.query}</p>
        <p className="mono-font text-[10px] text-stone-600">
          {m} · overlap@10 {e.overlap10} · baseline top-5 now at [{e.baselineTop5InSemantic.map(r => r ?? "–").join(", ")}]
          · pool {sum(e.baseline.perAdapter)} → {sum(e.semantic.perAdapter)}
          {errs.length ? ` · errors: ${errs.join(", ")}` : ""}
        </p>
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          {[["Baseline", e.baseline.results], ["Semantic", e.semantic.results]].map(([label, list]) => (
            <ol key={label} className="space-y-0.5">
              <li className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{label}</li>
              {list.map((r, i) => (
                <li key={i} className="text-[11px] text-stone-800 leading-snug">
                  <span className="mono-font text-stone-400">{String(i + 1).padStart(2, "0")}</span> {r.title}
                  <span className="mono-font text-[9px] text-stone-500">
                    {" "}· {r.source}{r.year ? ` · ${r.year}` : ""}{typeof r._sim === "number" ? ` · ${r._sim.toFixed(2)}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          ))}
        </div>
      )}
    </div>
  );
}
