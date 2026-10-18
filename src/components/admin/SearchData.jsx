import React, { useState, useCallback } from "react";
import { apiCall } from "../../lib/api.js";
import { ADAPTER_BY_ORDINAL } from "../../adapters/_shared/ordinals.js";

// v0.50 — Search data (admin console tab)
//
// Read-only windows onto the v0.50 capture tables via /api/telemetry?view=… (admin session-gated
// server-side). Four panels + two actions:
//   Summary   — 30-day volume by surface, totals, signal mix, on-disk size
//   Zero      — queries that returned ≤2 results (what the sources are missing)
//   Sources   — per-adapter impression share vs click share (ordinals decoded client-side)
//   Semantic  — semantic toggle on vs off: searches, click-in-top-5 rate, dwell
//   Promote   — fold click signals into relevance_labels (sprint §4.1) → feeds F2 + Semantic A/B
//   Export    — NDJSON of every event joined to its works + signals (the data door)

const SURFACE_NAME = { 0: "web", 1: "api", 2: "mcp", 3: "admin" };
const ACTION_NAME = { 0: "click-title", 1: "open-link", 2: "copy-cite", 3: "save", 4: "expand-cite", 5: "dwell", 10: "get-work", 11: "verify-ref", 12: "citations", 13: "resolve-ids" };
const src = (ord) => ADAPTER_BY_ORDINAL[ord] ?? `#${ord}`;
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");

function Table({ cols, rows }) {
  if (!rows?.length) return <p className="mono-font text-[10px] text-stone-500">No rows.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-stone-300">
            {cols.map((c) => <th key={c.key} className="mono-font text-[9px] uppercase tracking-widest text-stone-600 text-left py-1 pr-3">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-stone-100">
              {cols.map((c) => <td key={c.key} className="py-1 pr-3 text-stone-800 align-top">{c.render ? c.render(r) : String(r[c.key] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SearchData() {
  const [view, setView] = useState("summary");
  const [data, setData] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async (v) => {
    setBusy(v); setError(null);
    try {
      const res = await apiCall(`/api/telemetry?view=${v}`, "GET");
      if (!res.ok) throw new Error(`${res.status} ${(await res.json().catch(() => ({}))).error || ""}`);
      const payload = await res.json();
      setData((d) => ({ ...d, [v]: payload }));
    } catch (e) { setError(e.message); }
    setBusy(null);
  }, []);

  const promote = useCallback(async () => {
    if (!window.confirm("Fold click signals into relevance_labels? (idempotent — never lowers an existing label)")) return;
    setBusy("promote"); setError(null);
    try {
      const res = await apiCall("/api/telemetry?view=promote", "POST", {});
      if (!res.ok) throw new Error(`${res.status}`);
      const payload = await res.json();
      setData((d) => ({ ...d, promote: payload }));
    } catch (e) { setError(e.message); }
    setBusy(null);
  }, []);

  const select = (v) => { setView(v); if (!data[v]) load(v); };
  const d = data[view];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {["summary", "zero", "sources", "semantic"].map((v) => (
          <button key={v} onClick={() => select(v)}
            className={`mono-font text-[10px] uppercase tracking-widest px-3 py-1.5 border transition ${view === v ? "bg-stone-900 text-amber-50 border-stone-900" : "border-stone-300 text-stone-600 hover:border-stone-700"}`}>
            {v}
          </button>
        ))}
        <button onClick={() => load(view)} className="mono-font text-[10px] uppercase tracking-widest px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-stone-700">
          {busy === view ? "…" : "↻ refresh"}
        </button>
        <span className="flex-1" />
        <button onClick={promote} className="mono-font text-[10px] uppercase tracking-widest px-3 py-1.5 border border-amber-700 text-amber-900 hover:bg-amber-50">
          {busy === "promote" ? "…" : "Promote signals → labels"}
        </button>
        <a href="/api/telemetry?view=export" className="mono-font text-[10px] uppercase tracking-widest px-3 py-1.5 border border-stone-700 text-stone-800 hover:bg-stone-900 hover:text-amber-50">
          ↓ Export NDJSON
        </a>
      </div>

      {error && <p className="mono-font text-[10px] text-red-800">Error: {error}</p>}
      {data.promote && (
        <p className="mono-font text-[10px] text-emerald-800">
          Promoted: {data.promote.promoted?.clicked_grade2} clicked → grade 2 · {data.promote.promoted?.skipped_grade0} skipped-above → grade 0
        </p>
      )}

      {!d && !busy && <p className="mono-font text-[10px] text-stone-500">Select a panel.</p>}

      {view === "summary" && d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {Object.entries(d.totals || {}).map(([k, v]) => (
              <div key={k} className="border border-stone-300 p-2">
                <p className="mono-font text-[9px] uppercase tracking-widest text-stone-500">{k.replace(/_/g, " ")}</p>
                <p className="display-font text-lg text-stone-900">{String(v)}</p>
              </div>
            ))}
          </div>
          <p className="mono-font text-[9px] uppercase tracking-widest text-stone-500">By surface · last 30 d</p>
          <Table rows={d.bySurface} cols={[
            { key: "surface", label: "surface", render: (r) => SURFACE_NAME[r.surface] ?? r.surface },
            { key: "n", label: "searches" }, { key: "actors", label: "actors" }, { key: "users", label: "users" },
            { key: "zero", label: "zero-result" }, { key: "cache_hits", label: "cache hits" },
            { key: "avg_ms", label: "avg ms" }, { key: "avg_dwell_ms", label: "avg dwell ms" },
          ]} />
          <p className="mono-font text-[9px] uppercase tracking-widest text-stone-500">Signals · last 30 d</p>
          <Table rows={d.signals} cols={[
            { key: "action", label: "action", render: (r) => ACTION_NAME[r.action] ?? r.action },
            { key: "n", label: "n" }, { key: "unmatched", label: "unmatched (no search)" },
          ]} />
        </div>
      )}

      {view === "zero" && d && (
        <Table rows={d.rows} cols={[
          { key: "query", label: "query" }, { key: "n", label: "times" }, { key: "best", label: "best n" },
          { key: "surfaces", label: "surfaces", render: (r) => (r.surfaces || []).map((s) => SURFACE_NAME[s] ?? s).join(", ") },
          { key: "last", label: "last", render: (r) => String(r.last).slice(0, 16).replace("T", " ") },
        ]} />
      )}

      {view === "sources" && d && (() => {
        const impTotal = (d.impressions || []).reduce((s, r) => s + r.n, 0);
        const clkTotal = (d.clicks || []).reduce((s, r) => s + r.n, 0);
        const clickBy = Object.fromEntries((d.clicks || []).map((r) => [r.ordinal, r]));
        const rows = (d.impressions || []).map((r) => ({ ...r, clicks: clickBy[r.ordinal]?.n || 0, avg_rank: clickBy[r.ordinal]?.avg_rank }));
        return (
          <Table rows={rows} cols={[
            { key: "ordinal", label: "source", render: (r) => src(r.ordinal) },
            { key: "n", label: "impressions" }, { key: "share", label: "imp. share", render: (r) => pct(r.n, impTotal) },
            { key: "top5", label: "in top 5" },
            { key: "clicks", label: "clicks" }, { key: "cshare", label: "click share", render: (r) => pct(r.clicks, clkTotal) },
            { key: "ctr", label: "CTR", render: (r) => pct(r.clicks, r.n) },
            { key: "avg_rank", label: "avg clicked rank" },
          ]} />
        );
      })()}

      {view === "semantic" && d && (
        <Table rows={d.rows} cols={[
          { key: "semantic", label: "semantic", render: (r) => (r.semantic ? "on" : "off") },
          { key: "searches", label: "searches" },
          { key: "with_click", label: "with click", render: (r) => `${r.with_click} (${pct(r.with_click, r.searches)})` },
          { key: "with_click_top5", label: "click in top 5", render: (r) => `${r.with_click_top5} (${pct(r.with_click_top5, r.searches)})` },
          { key: "avg_dwell_ms", label: "avg dwell ms" }, { key: "avg_returned", label: "avg returned" },
        ]} />
      )}
    </div>
  );
}
