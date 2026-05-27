import React, { useMemo, useState } from "react";

const TYPE_LABELS = {
  "article":       "Article",
  "dataset":       "Dataset",
  "primary-source":"Primary Source",
  "book":          "Book",
  "book-chapter":  "Chapter",
  "report":        "Report",
  "thesis":        "Thesis",
  "image":         "Image",
  "misc":          "Other",
};

const SORT_OPTIONS = [
  { value: "default",   label: "Default" },
  { value: "relevance", label: "Relevance" },
  { value: "citations", label: "Citations ↓" },
  { value: "year",      label: "Year ↓" },
];

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

export function FilterBar({ sectionStates, filterState, onChange }) {
  const [expanded, setExpanded] = useState(false);

  // Derive available types and languages from live results
  const { availableTypes, availableLanguages } = useMemo(() => {
    const types = new Set();
    const langs = new Set();
    for (const section of Object.values(sectionStates)) {
      for (const r of section.results || []) {
        const t = r._type || r.type;
        if (t && TYPE_LABELS[t]) types.add(t);
        if (r.language) langs.add(r.language.toLowerCase());
      }
    }
    return { availableTypes: [...types].sort(), availableLanguages: [...langs].sort() };
  }, [sectionStates]);

  const set = (key, value) => onChange({ ...filterState, [key]: value });

  const hasActiveFilters =
    filterState.type || filterState.language || filterState.yearMin ||
    filterState.yearMax || (filterState.sortBy && filterState.sortBy !== "default");

  return (
    <div className="border border-stone-300 bg-stone-50/60 px-4 py-3 mb-2">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Sort row — always visible */}
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

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="ml-auto mono-font text-[9px] uppercase tracking-widest text-stone-500 hover:text-stone-900 transition"
        >
          {expanded ? "↑ fewer filters" : "↓ more filters"}
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
                <Pill key={t} active={filterState.type === t} onClick={() => set("type", filterState.type === t ? undefined : t)}>
                  {TYPE_LABELS[t] || t}
                </Pill>
              ))}
            </div>
          )}

          {/* Language filter */}
          {availableLanguages.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono-font text-[9px] uppercase tracking-widest text-stone-500 shrink-0">Lang</span>
              <Pill active={!filterState.language} onClick={() => set("language", undefined)}>All</Pill>
              {availableLanguages.slice(0, 8).map(l => (
                <Pill key={l} active={filterState.language === l} onClick={() => set("language", filterState.language === l ? undefined : l)}>
                  {l}
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
