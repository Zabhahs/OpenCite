import React, { useMemo, useRef, useEffect, useState } from "react";
import { normalizeLanguage } from "../lib/langNormalize.js";

const TYPE_LABELS = {
  "article":        "Article",
  "dataset":        "Dataset",
  "primary-source": "Primary Source",
  "book":           "Book",
  "book-chapter":   "Chapter",
  "report":         "Report",
  "thesis":         "Thesis",
  "image":          "Image / Artwork",
  "misc":           "Other",
};

const SORT_OPTIONS = [
  { value: "default",   label: "Default" },
  { value: "relevance", label: "Relevance" },
  { value: "citations", label: "Citations ↓" },
  { value: "year",      label: "Year ↓" },
];

const MAX_TOPICS = 8;

function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`mono-font text-[9px] uppercase tracking-widest px-2 py-1 border transition whitespace-nowrap ${
        active
          ? "bg-stone-900 text-amber-50 border-stone-900"
          : "bg-transparent text-stone-600 border-stone-400 hover:border-stone-700 hover:text-stone-900"
      }`}
    >
      {children}
    </button>
  );
}

// Language context menu — dropdown with per-language counts.
// Replaces the flat pill row to handle high-cardinality language sets
// (Europeana, Gallica, ONB, Chronicling America combined can exceed 15 languages).
function LangDropdown({ langs, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedDisplay = selected
    ? (langs.find(l => l.code === selected)?.display || selected)
    : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`mono-font text-[9px] uppercase tracking-widest px-2 py-1 border transition whitespace-nowrap ${
          selected
            ? "bg-stone-900 text-amber-50 border-stone-900"
            : "bg-transparent text-stone-600 border-stone-400 hover:border-stone-700 hover:text-stone-900"
        }`}
      >
        {selectedDisplay || "Language"} ▾
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 bg-white border border-stone-300 shadow-md min-w-[190px] max-h-60 overflow-y-auto">
          <button
            onClick={() => { onSelect(undefined); setOpen(false); }}
            className="w-full text-left mono-font text-[9px] uppercase tracking-widest px-3 py-2 hover:bg-stone-100 text-stone-500 border-b border-stone-100"
          >
            All languages
          </button>
          {langs.map(l => (
            <button
              key={l.code}
              onClick={() => { onSelect(selected === l.code ? undefined : l.code); setOpen(false); }}
              className={`w-full text-left mono-font text-[9px] uppercase tracking-widest px-3 py-2 hover:bg-stone-100 flex justify-between gap-4 ${
                selected === l.code
                  ? "bg-stone-50 text-stone-900 font-bold"
                  : "text-stone-700"
              }`}
            >
              <span>{l.display}</span>
              <span className="text-stone-400 font-normal">{l.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FilterBar({ sectionStates, filterState, onChange }) {
  const [expanded, setExpanded] = useState(false);

  const { availableTypes, langList, topTopics } = useMemo(() => {
    const types = new Set();
    const langMap = new Map();   // code → { code, display, count }
    const kwMap = new Map();     // lowercase → { display (original case), count }

    for (const section of Object.values(sectionStates)) {
      for (const r of section.results || []) {
        // Types
        const t = r._type || r.type;
        if (t && TYPE_LABELS[t]) types.add(t);

        // Languages — normalize all formats to a canonical code
        const lang = normalizeLanguage(r.language);
        if (lang) {
          const entry = langMap.get(lang.code) || { code: lang.code, display: lang.display, count: 0 };
          entry.count++;
          langMap.set(lang.code, entry);
        }

        // Keywords + subjects — aggregate for topics facet
        for (const term of [...(r.keywords || []), ...(r.subjects || [])]) {
          const kl = String(term).toLowerCase().trim();
          if (kl.length > 2 && kl.length < 60) {
            const existing = kwMap.get(kl);
            if (existing) {
              existing.count++;
            } else {
              kwMap.set(kl, { display: String(term).trim(), count: 1 });
            }
          }
        }
      }
    }

    const langList = [...langMap.values()].sort((a, b) => b.count - a.count);

    const topTopics = [...kwMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, MAX_TOPICS)
      .map(([kw, { display, count }]) => ({ kw, display, count }));

    return { availableTypes: [...types].sort(), langList, topTopics };
  }, [sectionStates]);

  const set = (key, value) => onChange({ ...filterState, [key]: value });

  const hasActiveFilters =
    filterState.type || filterState.language || filterState.yearMin ||
    filterState.yearMax || filterState.keyword || filterState.oaOnly ||
    (filterState.sortBy && filterState.sortBy !== "default");

  return (
    <div className="border border-stone-300 bg-stone-50/60 px-4 py-3 mb-2">
      {/* Always-visible row: sort + OA toggle + expand handle */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="mono-font text-[9px] uppercase tracking-widest text-stone-500 shrink-0">Sort</span>
        <div className="flex gap-1 flex-wrap">
          {SORT_OPTIONS.map(opt => (
            <Pill
              key={opt.value}
              active={filterState.sortBy === opt.value || (!filterState.sortBy && opt.value === "default")}
              onClick={() => set("sortBy", opt.value === "default" ? undefined : opt.value)}
            >
              {opt.label}
            </Pill>
          ))}
        </div>

        <Pill
          active={!!filterState.oaOnly}
          onClick={() => set("oaOnly", filterState.oaOnly ? undefined : true)}
        >
          OA Only
        </Pill>

        <button
          onClick={() => setExpanded(e => !e)}
          className="ml-auto mono-font text-[9px] uppercase tracking-widest border border-stone-600 text-stone-800 bg-stone-100 px-2 py-1 hover:bg-stone-900 hover:text-amber-50 hover:border-stone-900 transition"
        >
          {expanded ? "↑ fewer filters" : "↓ search filters"}
          {hasActiveFilters && !expanded && (
            <span className="ml-1 bg-amber-400 text-stone-900 px-1 py-0.5">●</span>
          )}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">

          {/* Type filter */}
          {availableTypes.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono-font text-[9px] uppercase tracking-widest text-stone-500 shrink-0">Type</span>
              <Pill active={!filterState.type} onClick={() => set("type", undefined)}>All</Pill>
              {availableTypes.map(t => (
                <Pill
                  key={t}
                  active={filterState.type === t}
                  onClick={() => set("type", filterState.type === t ? undefined : t)}
                >
                  {TYPE_LABELS[t] || t}
                </Pill>
              ))}
            </div>
          )}

          {/* Language context menu — dropdown with counts */}
          {langList.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono-font text-[9px] uppercase tracking-widest text-stone-500 shrink-0">Lang</span>
              <LangDropdown
                langs={langList}
                selected={filterState.language}
                onSelect={code => set("language", code)}
              />
              {filterState.language && (
                <button
                  onClick={() => set("language", undefined)}
                  className="mono-font text-[9px] text-stone-400 hover:text-stone-700 transition"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Topics facet — top-N keywords/subjects derived from live results */}
          {topTopics.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono-font text-[9px] uppercase tracking-widest text-stone-500 shrink-0">Topics</span>
              <Pill active={!filterState.keyword} onClick={() => set("keyword", undefined)}>All</Pill>
              {topTopics.map(({ kw, display, count }) => (
                <Pill
                  key={kw}
                  active={filterState.keyword === kw}
                  onClick={() => set("keyword", filterState.keyword === kw ? undefined : kw)}
                >
                  {display}
                  <span className="ml-1 opacity-40 normal-case tracking-normal">{count}</span>
                </Pill>
              ))}
            </div>
          )}

          {/* Year range */}
          <div className="flex items-center gap-2">
            <span className="mono-font text-[9px] uppercase tracking-widest text-stone-500 shrink-0">Year</span>
            <input
              type="number"
              placeholder="From"
              value={filterState.yearMin || ""}
              onChange={e => set("yearMin", e.target.value ? parseInt(e.target.value, 10) : undefined)}
              className="mono-font text-[10px] w-20 border border-stone-300 px-2 py-1 bg-white text-stone-900 focus:outline-none focus:border-stone-700"
            />
            <span className="mono-font text-[9px] text-stone-400">–</span>
            <input
              type="number"
              placeholder="To"
              value={filterState.yearMax || ""}
              onChange={e => set("yearMax", e.target.value ? parseInt(e.target.value, 10) : undefined)}
              className="mono-font text-[10px] w-20 border border-stone-300 px-2 py-1 bg-white text-stone-900 focus:outline-none focus:border-stone-700"
            />

            {hasActiveFilters && (
              <button
                onClick={() => onChange({})}
                className="mono-font text-[9px] uppercase tracking-widest text-red-800 hover:text-red-600 transition ml-2"
              >
                ✕ clear all
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
