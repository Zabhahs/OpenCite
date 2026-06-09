import React, { useState, useEffect, useCallback } from "react";
import { computeMetrics, aggregateMetrics } from "../../lib/goldSetMetrics.js";
import { storage } from "../../lib/storage.js";

// F2 — Gold-Set Regression Harness
// Store test queries with labeled relevance; run regression tests; track nDCG@10 / MRR / recall.
export function GoldSetHarness() {
  const [goldQueries, setGoldQueries] = useState([]);
  const [newQuery, setNewQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [gradingMode, setGradingMode] = useState(null); // { query, results }
  const [testRuns, setTestRuns] = useState([]);

  // Load gold queries and test runs from the opencite: namespace (lib/storage.js).
  // One-time migration of the legacy bare keys (opencite_gold_queries /
  // opencite_test_runs) runs first: read bare → write namespaced → remove bare.
  // No-op once the bare key is gone, so it's safe to run on every mount. Runs
  // before the read below, and before the write effects fire (React lifecycle),
  // so existing admin data is preserved transparently. (F-310 / F-504)
  useEffect(() => {
    const migrateKey = (bare, nsKey) => {
      const raw = localStorage.getItem(bare);
      if (raw === null) return;
      try { storage.set(nsKey, JSON.parse(raw)); } catch { storage.set(nsKey, raw); }
      localStorage.removeItem(bare);
    };
    migrateKey("opencite_gold_queries", "gold_queries");
    migrateKey("opencite_test_runs", "test_runs");

    const saved = storage.get("gold_queries");
    if (Array.isArray(saved)) setGoldQueries(saved);
    const runs = storage.get("test_runs");
    if (Array.isArray(runs)) setTestRuns(runs);
  }, []);

  // Persist to the namespaced store on change.
  useEffect(() => {
    storage.set("gold_queries", goldQueries);
  }, [goldQueries]);

  useEffect(() => {
    storage.set("test_runs", testRuns);
  }, [testRuns]);

  // Create a new gold query: search, then enter grading mode
  const handleCreateGoldQuery = useCallback(async () => {
    if (!newQuery.trim()) return;

    setRunning(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(newQuery)}&debug=1&limit=25`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setGradingMode({ query: newQuery, results: data.results || [] });
      setNewQuery("");
    } catch (e) {
      alert(`Search failed: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }, [newQuery]);

  // Save grades for a query
  const handleSaveGrades = useCallback((grades) => {
    if (!gradingMode) return;

    // Deduplicate: if query already exists, replace it
    const existing = goldQueries.findIndex((q) => q.query === gradingMode.query);
    const newEntry = { query: gradingMode.query, labels: grades, createdAt: new Date().toISOString() };

    if (existing >= 0) {
      setGoldQueries((prev) => {
        const next = [...prev];
        next[existing] = newEntry;
        return next;
      });
    } else {
      setGoldQueries((prev) => [...prev, newEntry]);
    }

    setGradingMode(null);
  }, [gradingMode, goldQueries]);

  // Run all gold queries and compute metrics
  const handleRunTests = useCallback(async () => {
    if (!goldQueries.length) {
      alert("No gold queries defined.");
      return;
    }

    setRunning(true);
    const run = { timestamp: new Date().toISOString(), queries: [] };

    try {
      for (const goldQ of goldQueries) {
        const res = await fetch(`/api/search?q=${encodeURIComponent(goldQ.query)}&limit=25`);
        if (!res.ok) continue;
        const data = await res.json();
        const results = data.results || [];
        const metrics = computeMetrics(results, goldQ.labels);

        run.queries.push({
          query: goldQ.query,
          results: results.slice(0, 10), // store top 10 for inspection
          metrics,
        });
      }

      // Aggregate metrics
      run.aggregate = aggregateMetrics(run.queries.map((q) => q.metrics));

      // Store the run
      setTestRuns((prev) => [run, ...prev]);
      setResults(run);
    } catch (e) {
      alert(`Test run failed: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }, [goldQueries]);

  // Delete a gold query
  const handleDeleteQuery = useCallback((idx) => {
    setGoldQueries((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // Clear all results
  const handleClearRuns = useCallback(() => {
    if (confirm("Clear all test run history?")) {
      setTestRuns([]);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Grading mode: label results for a query */}
      {gradingMode && (
        <GradingModal
          query={gradingMode.query}
          results={gradingMode.results}
          onSave={handleSaveGrades}
          onCancel={() => setGradingMode(null)}
        />
      )}

      {/* Create gold query */}
      <div className="space-y-2">
        <label className="mono-font text-xs uppercase tracking-widest text-stone-600">
          Add New Gold Query
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newQuery}
            onChange={(e) => setNewQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateGoldQuery()}
            placeholder="Type a query…"
            className="flex-1 px-3 py-2 border border-stone-300 rounded text-sm font-mono"
          />
          <button
            onClick={handleCreateGoldQuery}
            disabled={running || !newQuery.trim()}
            className="px-4 py-2 bg-stone-900 text-white rounded text-xs font-mono uppercase disabled:opacity-50"
          >
            {running ? "Loading…" : "Add"}
          </button>
        </div>
      </div>

      {/* Gold queries list */}
      {goldQueries.length > 0 && (
        <div className="space-y-3">
          <p className="mono-font text-xs uppercase tracking-widest text-stone-600">
            Gold Queries ({goldQueries.length})
          </p>
          {goldQueries.map((q, idx) => (
            <div key={idx} className="border border-stone-200 bg-stone-50/40 rounded p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-stone-900 flex-1">{q.query}</p>
                <button
                  onClick={() => handleDeleteQuery(idx)}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
              <p className="mono-font text-xs text-stone-600">
                {Object.values(q.labels || {}).length} labels
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Run tests button */}
      <button
        onClick={handleRunTests}
        disabled={running || !goldQueries.length}
        className="w-full px-4 py-3 bg-green-700 text-white rounded text-xs font-mono uppercase hover:bg-green-800 disabled:opacity-50"
      >
        {running ? "Running Tests…" : "Run All Tests"}
      </button>

      {/* Test results */}
      {results && (
        <TestResults
          result={results}
          previousRun={testRuns[1] || null}
          onClear={handleClearRuns}
        />
      )}

      {/* History */}
      {testRuns.length > 0 && !results && (
        <div className="space-y-3">
          <p className="mono-font text-xs uppercase tracking-widest text-stone-600">
            Test History ({testRuns.length})
          </p>
          {testRuns.slice(0, 5).map((run, idx) => (
            <div key={idx} className="border border-stone-200 bg-stone-50/40 rounded p-3">
              <p className="mono-font text-xs text-stone-700">
                {new Date(run.timestamp).toLocaleString()}
              </p>
              <p className="mono-font text-xs text-stone-600">
                avg nDCG@10: <span className="font-semibold">{(run.aggregate?.avgNDCG10 || 0).toFixed(3)}</span>
              </p>
            </div>
          ))}
          <button
            onClick={handleClearRuns}
            className="text-xs text-red-600 hover:text-red-800"
          >
            Clear History
          </button>
        </div>
      )}
    </div>
  );
}

// Grading modal: user rates each result 0–3
function GradingModal({ query, results, onSave, onCancel }) {
  const [grades, setGrades] = useState({});

  const handleGrade = (key, grade) => {
    setGrades((prev) => ({ ...prev, [key]: grade }));
  };

  const handleSave = () => {
    onSave(grades);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto space-y-4">
        <h3 className="text-lg font-bold text-stone-900">Grade Results: {query}</h3>
        <p className="mono-font text-xs text-stone-600">
          Rate each result: 0 (irrelevant) — 1 (marginal) — 2 (relevant) — 3 (perfect)
        </p>

        <div className="space-y-3">
          {results.map((r, idx) => {
            const key = r.doi || r.title;
            const grade = grades[key] ?? -1;

            return (
              <div key={idx} className="border border-stone-200 rounded p-3 space-y-2">
                <p className="text-sm font-semibold text-stone-900 line-clamp-1">
                  {r.title || "Untitled"}
                </p>
                {r.doi && (
                  <p className="mono-font text-xs text-stone-600 truncate">{r.doi}</p>
                )}

                <div className="flex gap-2">
                  {[
                    { label: "0", value: 0, color: "bg-red-100 border-red-300" },
                    { label: "1", value: 1, color: "bg-amber-100 border-amber-300" },
                    { label: "2", value: 2, color: "bg-green-100 border-green-300" },
                    { label: "3", value: 3, color: "bg-green-200 border-green-400" },
                  ].map((btn) => (
                    <button
                      key={btn.value}
                      onClick={() => handleGrade(key, btn.value)}
                      className={`flex-1 px-2 py-1 border rounded text-xs font-bold ${
                        grade === btn.value
                          ? `${btn.color} ring-2 ring-offset-1`
                          : `${btn.color} opacity-40`
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 pt-4 border-t border-stone-200">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-green-700 text-white rounded text-xs font-mono uppercase"
          >
            Save Grades
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-stone-300 text-stone-900 rounded text-xs font-mono uppercase"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Test results display with diff vs previous run
function TestResults({ result, previousRun, onClear }) {
  const agg = result.aggregate || {};
  const prevAgg = previousRun?.aggregate || {};

  const formatDiff = (current, previous) => {
    if (previous === 0 || previous === undefined) return "";
    const delta = current - previous;
    const sign = delta > 0 ? "+" : "";
    return ` (${sign}${(delta * 100).toFixed(1)}%)`;
  };

  return (
    <div className="border border-green-300 bg-green-50/60 rounded p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-green-900">Test Results</h4>
        <p className="mono-font text-xs text-green-700">
          {new Date(result.timestamp).toLocaleString()}
        </p>
      </div>

      {/* Aggregate metrics */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Avg nDCG@10"
          value={(agg.avgNDCG10 || 0).toFixed(3)}
          diff={formatDiff(agg.avgNDCG10, prevAgg.avgNDCG10)}
        />
        <MetricCard
          label="Avg MRR"
          value={(agg.avgMRR || 0).toFixed(3)}
          diff={formatDiff(agg.avgMRR, prevAgg.avgMRR)}
        />
        <MetricCard
          label="Avg Recall@10"
          value={(agg.avgRecall10 || 0).toFixed(3)}
          diff={formatDiff(agg.avgRecall10, prevAgg.avgRecall10)}
        />
        <MetricCard
          label="Avg Recall@20"
          value={(agg.avgRecall20 || 0).toFixed(3)}
          diff={formatDiff(agg.avgRecall20, prevAgg.avgRecall20)}
        />
      </div>

      {/* Per-query results */}
      <div className="space-y-2">
        <p className="mono-font text-xs uppercase tracking-widest text-green-900">
          Per-Query
        </p>
        {result.queries.map((q, idx) => (
          <div key={idx} className="border border-green-200 rounded p-2 space-y-1">
            <p className="text-xs font-semibold text-stone-900">{q.query}</p>
            <div className="flex gap-3 text-xs mono-font text-stone-600">
              <span>nDCG: {(q.metrics.nDCG10 || 0).toFixed(3)}</span>
              <span>MRR: {(q.metrics.MRR || 0).toFixed(3)}</span>
              <span>Recall@10: {(q.metrics.recall10 || 0).toFixed(3)}</span>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onClear}
        className="text-xs text-red-600 hover:text-red-800 mt-2"
      >
        Clear History
      </button>
    </div>
  );
}

// Metric card for display
function MetricCard({ label, value, diff }) {
  return (
    <div className="border border-green-200 rounded p-2">
      <p className="mono-font text-xs text-green-800">{label}</p>
      <p className="text-lg font-bold text-green-900">{value}</p>
      {diff && (
        <p className="mono-font text-xs text-green-700">{diff}</p>
      )}
    </div>
  );
}
