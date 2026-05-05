import React from "react";
import { TAG_VOCAB } from "../constants/vocabulary.js";
import { REGION_ORDER } from "../constants/defaults.js";

export function LauncherBlock({ query, launchers }) {
  const groups = {};
  launchers.forEach(L => {
    L.region.forEach(r => {
      if (!groups[r]) groups[r] = [];
      if (!groups[r].some(x => x.id === L.id)) groups[r].push(L);
    });
  });
  const orderedRegions = REGION_ORDER.filter(r => groups[r]?.length);

  return (
    <section className="border-l-4 border-stone-400 pl-5 md:pl-7 py-2">
      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <span className="mono-font text-[10px] uppercase tracking-widest bg-stone-700 text-stone-50 px-2 py-1">External</span>
        <span className="mono-font text-xs text-stone-500">launchers · open in new tab</span>
      </div>
      <p className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-5">
        Archives without queryable APIs · pre-filled search opens in a new tab
      </p>
      <div className="space-y-2">
        {orderedRegions.map(region => (
          <details key={region} className="group border border-stone-300 bg-stone-50/40">
            <summary className="cursor-pointer list-none flex items-center justify-between p-3 hover:bg-stone-100/40 transition">
              <span className="display-font font-bold text-stone-900">{TAG_VOCAB.region[region]}</span>
              <span className="mono-font text-[10px] uppercase tracking-widest text-stone-600">
                {groups[region].length} {groups[region].length === 1 ? "source" : "sources"} <span className="ml-2 inline-block group-open:rotate-180 transition">▾</span>
              </span>
            </summary>
            <div className="border-t border-stone-300 p-3 space-y-2">
              {groups[region].map(L => (
                <div key={L.id} className="flex items-start gap-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="display-font font-bold text-stone-900">{L.name}</div>
                    <div className="mono-font text-[10px] uppercase tracking-widest text-stone-600 mb-1">{L.tagline}</div>
                    <div className="flex flex-wrap gap-1">
                      {L.contentType.map(ct => (
                        <span key={ct} className="mono-font text-[9px] uppercase tracking-widest bg-stone-200 text-stone-700 px-1.5 py-0.5">{TAG_VOCAB.contentType[ct] || ct}</span>
                      ))}
                      {L.archiveType.map(at => (
                        <span key={at} className="mono-font text-[9px] uppercase tracking-widest bg-amber-100 text-amber-900 px-1.5 py-0.5">{TAG_VOCAB.archiveType[at] || at}</span>
                      ))}
                    </div>
                  </div>
                  <a href={L.buildUrl(query)} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 mono-font text-[10px] uppercase tracking-widest bg-stone-700 text-amber-50 px-3 py-2 hover:bg-stone-900 transition whitespace-nowrap">
                    Open ↗
                  </a>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
