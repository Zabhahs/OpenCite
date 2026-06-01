// OpenCITE — SearchControls
// Always-visible relevance controls that live directly under the search bar (no
// Settings detour). Headline control is the Lexical↔Semantic RRF slider; a compact
// "Search settings" disclosure beneath it exposes the quick search toggles.
import { useState } from "react";

// Compact On/Off toggle matching the panel button-group idiom.
function Toggle({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="mono-font text-[10px] uppercase tracking-widest text-stone-600">{label}</span>
      <div className="flex gap-1">
        {[[true, "On"], [false, "Off"]].map(([val, lbl]) => (
          <button
            key={String(val)}
            onClick={() => onChange(val)}
            className={`mono-font text-[9px] uppercase tracking-widest px-2 py-1 border transition ${
              !!value === val
                ? "bg-stone-900 text-amber-50 border-stone-900"
                : "bg-transparent text-stone-500 border-stone-300 hover:border-stone-600 hover:text-stone-800"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SearchControls({ settings, onSave, rrfWeight, onRrfWeightChange, onRrfWeightCommit, onOpenSettings, admin }) {
  const s = settings;
  const [open, setOpen] = useState(false);
  const w = rrfWeight ?? 0.4;
  const pct = Math.round(w * 100);
  // Simple (raw) mode bypasses semantic ranking → grey the slider while it's on.
  const semOn = !!s.semanticSearch && !s.simpleSearch;
  const view = s.viewMode || "unified";
  const upd = (patch) => onSave({ ...s, ...patch });

  return (
    <div className="mt-3 mb-6">
      {/* Always-visible relevance slider — Lexical (left) ↔ Semantic (right) */}
      <div className={semOn ? "" : "opacity-50"}>
        <div className="flex items-baseline justify-between mb-1">
          <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">Lexical</span>
          <span className="mono-font text-[10px] uppercase tracking-widest text-stone-700">
            Relevance · {100 - pct} / {pct}
          </span>
          <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">Semantic</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          disabled={!semOn}
          onChange={e => onRrfWeightChange(Number(e.target.value) / 100)}
          onPointerUp={e => onRrfWeightCommit(Number(e.target.value) / 100)}
          onKeyUp={e => onRrfWeightCommit(Number(e.target.value) / 100)}
          onTouchEnd={e => onRrfWeightCommit(Number(e.target.value) / 100)}
          className="w-full accent-stone-900 cursor-pointer disabled:cursor-not-allowed"
        />
      </div>

      {/* Context-menu disclosure for the search toggles */}
      <div className="flex items-center justify-between mt-1">
        <button
          onClick={() => setOpen(o => !o)}
          className="mono-font text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-900 transition flex items-center gap-1"
        >
          <span>{open ? "▾" : "▸"}</span> Search settings
        </button>
        {pct !== 40 && semOn && (
          <button
            onClick={() => { onRrfWeightChange(0.4); onRrfWeightCommit(0.4); }}
            className="mono-font text-[10px] uppercase tracking-widest text-stone-500 hover:text-red-900 transition underline"
          >
            Reset balance
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 border border-stone-300 bg-amber-50/70 px-3 py-2 fade-in">
          {/* Result layout — moved here from Settings (v.37). Unified ranks across all
              sources; Source view groups per database for per-adapter auditing. */}
          <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="mono-font text-[10px] uppercase tracking-widest text-stone-600">Result layout</span>
            <div className="flex gap-1">
              {[["unified", "Unified"], ["source", "Source"]].map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => upd({ viewMode: val })}
                  className={`mono-font text-[9px] uppercase tracking-widest px-2 py-1 border transition ${
                    view === val
                      ? "bg-stone-900 text-amber-50 border-stone-900"
                      : "bg-transparent text-stone-500 border-stone-300 hover:border-stone-600 hover:text-stone-800"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {!semOn && (
            <p className="text-[11px] text-stone-500 mb-1 leading-relaxed">
              {s.simpleSearch
                ? "Simple search is on — ranking is bypassed, so the relevance slider above is inactive."
                : "Semantic ranking is off — the relevance slider above is inactive."}
            </p>
          )}
          <Toggle label="Semantic ranking" value={s.semanticSearch} onChange={v => upd({ semanticSearch: v })} />
          <Toggle label="Synonym expansion" value={s.synonyms} onChange={v => upd({ synonyms: v })} />
          <Toggle label="Author search" value={s.authorSearch} onChange={v => upd({ authorSearch: v })} />

          {/* v0.36 — admin-only raw diagnostic. Not shown to non-admins. */}
          {admin && (
            <div className="pt-2 mt-1 border-t border-red-200">
              <Toggle label="⚗ Simple search (raw)" value={s.simpleSearch} onChange={v => upd({ simpleSearch: v })} />
              <p className="text-[10px] text-stone-500 leading-relaxed">
                Admin diagnostic: raw adapter output in fetch order — skips dedup, scoring &amp; the confidence gate (semantic ranking bypassed while on).
              </p>
            </div>
          )}

          <div className="pt-2 mt-1 border-t border-stone-200">
            <button
              onClick={onOpenSettings}
              className="mono-font text-[10px] uppercase tracking-widest text-stone-600 hover:text-stone-900 transition underline"
            >
              All settings →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
