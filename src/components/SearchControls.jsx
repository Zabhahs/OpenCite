// OpenCITE — SearchControls
// Quick search settings that live directly under the search bar (no Settings detour):
// result layout (Unified/Source) and author search. The Lexical↔Semantic slider and
// synonym/semantic/simple toggles were removed in v0.44 — the ranking engine is gone;
// results display in each source's native relevance order.
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

export function SearchControls({ settings, onSave, onOpenSettings }) {
  const s = settings;
  const [open, setOpen] = useState(false);
  const view = s.viewMode || "unified";
  const upd = (patch) => onSave({ ...s, ...patch });

  return (
    <div className="mt-3 mb-6">
      {/* Context-menu disclosure for the search toggles */}
      <div className="flex items-center justify-between mt-1">
        <button
          onClick={() => setOpen(o => !o)}
          className="mono-font text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-900 transition flex items-center gap-1"
        >
          <span>{open ? "▾" : "▸"}</span> Search settings
        </button>
      </div>

      {open && (
        <div className="mt-2 border border-stone-300 bg-amber-50/70 px-3 py-2 fade-in">
          {/* Result layout — moved here from Settings (v.37). Unified interleaves across
              all sources; Source view groups per database for per-adapter auditing. */}
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

          <Toggle label="Author search" value={s.authorSearch} onChange={v => upd({ authorSearch: v })} />

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
