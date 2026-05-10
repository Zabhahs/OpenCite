import React, { useState } from "react";
import { buildMLA, buildAPA, segmentsToPlain, exportAs } from "../lib/citations.js";
import { truncate } from "../lib/helpers.js";

export function ResultCard({ result, index, onCopy, copied, isInLibrary, onToggleLibrary }) {
  const mlaSegs = buildMLA(result);
  const apaSegs = buildAPA(result);
  const cardId = result.id;
  const [imgFailed, setImgFailed] = useState(false);
  const hasImage = result.previewImage && !imgFailed;

  return (
    <article className="border border-stone-300 bg-stone-50/40 p-4 md:p-5">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="display-font text-xl font-black text-stone-900">№{String(index + 1).padStart(2, "0")}</span>
        {result.year && <span className="mono-font text-xs text-stone-600">{result.year}</span>}
        {!result.isOA && <span className="mono-font text-[10px] uppercase tracking-widest text-amber-900">may be paywalled</span>}
        {onToggleLibrary && (
          <button
            onClick={() => onToggleLibrary(result)}
            className={`ml-auto mono-font text-xs transition ${isInLibrary ? "text-amber-700 hover:text-red-900" : "text-stone-400 hover:text-amber-700"}`}
            aria-label={isInLibrary ? "Remove from library" : "Save to library"}
          >
            {isInLibrary ? "★ Saved" : "☆ Save"}
          </button>
        )}
      </div>

      <div className={hasImage ? "grid grid-cols-[120px_1fr] md:grid-cols-[160px_1fr] gap-4 md:gap-5" : ""}>
        {hasImage && (
          <div className="shrink-0">
            <a href={result.url || result.previewImage} target="_blank" rel="noopener noreferrer">
              <img
                src={result.previewImage} alt={result.title}
                loading={index < 2 ? "eager" : "lazy"}
                onError={() => setImgFailed(true)}
                className="w-full aspect-square object-cover border border-stone-300 bg-stone-100"
              />
            </a>
          </div>
        )}
        <div>
          <h4 className="display-font text-lg md:text-xl font-bold text-stone-900 mb-1 leading-tight" style={{ letterSpacing: "-0.01em" }}>
            {result.title}
          </h4>
          {result.authors?.length > 0 && (
            <p className="display-font italic text-sm text-stone-700 mb-1">
              {result.authors.slice(0, 4).join(", ")}{result.authors.length > 4 ? ", et al." : ""}
            </p>
          )}
          {(result.journal || result.publisher) && (
            <p className="mono-font text-[10px] uppercase tracking-wider text-stone-600 mb-3">
              {result.journal || result.publisher}
            </p>
          )}
          {result.abstract && (
            <p className="text-sm text-stone-800 leading-relaxed mb-3">
              {truncate(result.abstract, hasImage ? 200 : 280)}
            </p>
          )}
        </div>
      </div>

      {result.url && (
        <a href={result.url} target="_blank" rel="noopener noreferrer"
          className="inline-block mono-font text-[10px] uppercase tracking-widest text-stone-900 underline-thick hover:text-red-900 transition mb-4 break-all">
          Read full text →
        </a>
      )}

      <div className="bg-white border border-stone-300 p-3 space-y-3">
        {/* MLA 9 + APA 7 — unchanged */}
        {[["MLA 9", mlaSegs, segmentsToPlain(mlaSegs), "mla"], ["APA 7", apaSegs, segmentsToPlain(apaSegs), "apa"]].map(([label, segs, plain, style], idx) => (
          <div key={style} className={idx > 0 ? "pt-2 border-t border-stone-200" : ""}>
            <div className="flex items-center justify-between mb-1">
              <span className="mono-font text-[10px] uppercase tracking-widest text-stone-700">{label}</span>
              <button onClick={() => onCopy(plain, cardId, style)}
                className="mono-font text-[10px] uppercase tracking-widest text-stone-700 hover:text-red-900 transition">
                {copied.id === cardId && copied.style === style ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <p className="text-xs md:text-sm text-stone-800 leading-relaxed">
              {segs.map((s, j) => s.italic ? <em key={j}>{s.text}</em> : <span key={j}>{s.text}</span>)}
            </p>
          </div>
        ))}

        {/* Export formats — BibTeX, RIS, CSL-JSON */}
        <div className="pt-2 border-t border-stone-200">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">Export as</span>
            <div className="flex gap-4">
              {[["BibTeX", "bibtex"], ["RIS", "ris"], ["CSL-JSON", "csl-json"]].map(([label, fmt]) => (
                <button
                  key={fmt}
                  onClick={() => onCopy(exportAs(result, fmt), cardId, fmt)}
                  className="mono-font text-[10px] uppercase tracking-widest text-stone-500 hover:text-red-900 transition"
                >
                  {copied.id === cardId && copied.style === fmt ? "✓" : label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
