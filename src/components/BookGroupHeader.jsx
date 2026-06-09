import React from "react";

// ---------------------------------------------------------------------------
// BookGroupHeader — parent-work header for a cluster of book chapters that
// share the same container title. Extracted in v0.41 (R-301 / F-314) from the
// verbatim-duplicated header block in SourceSection and UnifiedResultList.
//
// Renders the chapter-count badge, year, container title, editors, and
// publisher. The outer group <div> and the per-view chapter cards stay in the
// parent components — only this shared header is factored out.
//
// Props:
//   group — grouped-result object: { items, year, parentTitle, editors, publisher }
// ---------------------------------------------------------------------------

export function BookGroupHeader({ group }) {
  return (
    <div className="px-4 pt-4 pb-3 border-b border-stone-300">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="mono-font text-[9px] uppercase tracking-widest bg-stone-300 text-stone-700 px-2 py-0.5">
          {group.items.length} chapter{group.items.length !== 1 ? "s" : ""}
        </span>
        {group.year && (
          <span className="mono-font text-[10px] text-stone-500">{group.year}</span>
        )}
      </div>
      <h3
        className="display-font text-lg font-bold text-stone-900 leading-tight"
        style={{ letterSpacing: "-0.01em" }}
      >
        {group.parentTitle}
      </h3>
      {group.editors?.length > 0 && (
        <p className="display-font italic text-sm text-stone-600 mt-1">
          Edited by {group.editors.slice(0, 3).join(", ")}
          {group.editors.length > 3 ? ", et al." : ""}
        </p>
      )}
      {group.publisher && (
        <p className="mono-font text-[10px] uppercase tracking-wider text-stone-500 mt-1">
          {group.publisher}
        </p>
      )}
    </div>
  );
}
