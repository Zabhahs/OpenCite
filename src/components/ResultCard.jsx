// OpenCITE — ResultCard
// Displays a single search result with citation, save, and copy functionality.

import React, { useState } from "react";
import { buildMLA, buildAPA, segmentsToPlain } from "../lib/citations.js";
import { truncate } from "../lib/helpers.js";
import { EagleTooltip } from "./EagleTooltip.jsx";
import { useEagleTooltip } from "../hooks/useEagleTooltip.js";

const EAGLE_LIBRARY_MSG =
  "Saved! ★ Open your Library to select favourites and export them as BibTeX, RIS, or CSL-JSON.";

export function ResultCard({ result, index, onCopy, copied, isInLibrary, onToggleLibrary }) {
  const mlaSegs = buildMLA(result);
  const apaSegs = buildAPA(result);
  const cardId = result.id;
  const [imgFailed, setImgFailed] = useState(false);
  const [citationsOpen, setCitationsOpen] = useState(false);
  const hasImage = result.previewImage && !imgFailed;

  // Eagle tooltip — one-time, triggered on first ever library save
  const eagle = useEagleTooltip("eagle_library_prompted");

  const handleToggleLibrary = () => {
    if (!isInLibrary) {
      // Saving — show eagle if first time
      eagle.show();
    }
    onToggleLibrary(result);
  };

  return (
    <article
      className="border border-stone-300 bg-stone-50/40 p-4 md:p-5"
      style={{ overflowWrap: "break-word", wordBreak: "break-word" }}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="display-font text-xl font-black text-stone-900">
          №{String(index + 1).padStart(2, "0")}
        </span>
        {result.year && (
          <span className="mono-font text-xs text-stone-600">{result.year}</span>
        )}
        {!result.isOA && (
          <span className="mono-font text-[10px] uppercase tracking-widest text-amber-900">
            may be paywalled
          </span>
        )}

        {/* ── Star save button — high contrast, larger ── */}
        {onToggleLibrary && (
          <button
            onClick={handleToggleLibrary}
            aria-label={isInLibrary ? "Remove from library" : "Save to library"}
            className="ml-auto flex items-center gap-1.5 transition-all"
            style={{ lineHeight: 1 }}
          >
            <span
              style={{
                fontSize: "1.5rem",
                color: isInLibrary ? "#b45309" : "transparent",
                WebkitTextStroke: isInLibrary ? "0" : "2px #1c1917",
                filter: isInLibrary
                  ? "drop-shadow(0 1px 3px rgba(180,83,9,0.4))"
                  : "none",
                transition: "all 0.15s ease",
              }}
            >
              ★
            </span>
            <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">
              {isInLibrary ? "saved" : "save"}
            </span>
          </button>
        )}
      </div>

      {/* Eagle tooltip — renders inline below the header row */}
      <EagleTooltip {...eagle.props} message={EAGLE_LIBRARY_MSG} />

      <div className={hasImage ? "grid grid-cols-[120px_1fr] md:grid-cols-[160px_1fr] gap-4 md:gap-5" : ""}>
        {hasImage && (
          <div className="shrink-0">
            <a href={result.url || result.previewImage} target="_blank" rel="noopener noreferrer">
              <img
                src={result.previewImage}
                alt={result.title}
                loading={index < 2 ? "eager" : "lazy"}
                onError={() => setImgFailed(true)}
                className="w-full aspect-square object-cover border border-stone-300 bg-stone-100"
              />
            </a>
          </div>
        )}
        <div className="min-w-0">
          <h4
            className="display-font text-lg md:text-xl font-bold text-stone-900 mb-1 leading-tight break-words"
            style={{ letterSpacing: "-0.01em" }}
          >
            {result.title}
          </h4>
          {result.authors?.length > 0 && (
            <p className="display-font italic text-sm text-stone-700 mb-1 break-words">
              {result.authors.slice(0, 4).join(", ")}
              {result.authors.length > 4 ? ", et al." : ""}
            </p>
          )}
          {(result.journal || result.publisher) && (
            <p className="mono-font text-[10px] uppercase tracking-wider text-stone-600 mb-3 break-words">
              {result.journal || result.publisher}
            </p>
          )}
          {result.abstract && (
            <p className="text-sm text-stone-800 leading-relaxed mb-3 break-words">
              {truncate(result.abstract, hasImage ? 200 : 280)}
            </p>
          )}
        </div>
      </div>

      {result.url && (
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mono-font text-[10px] uppercase tracking-widest text-stone-900 underline-thick hover:text-red-900 transition mb-4 break-all"
        >
          Read full text →
        </a>
      )}

      {/* Citations — MLA + APA only */}
      <div className="border border-stone-300 bg-white">
        <button
          onClick={() => setCitationsOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-stone-50 transition"
          aria-expanded={citationsOpen}
        >
          <span className="mono-font text-[10px] uppercase tracking-widest text-stone-600">
            Cite · MLA 9 · APA 7
          </span>
          <span className="mono-font text-[10px] text-stone-400 ml-2">
            {citationsOpen ? "↑ hide" : "↓ expand"}
          </span>
        </button>

        {citationsOpen && (
          <div className="border-t border-stone-200 p-3 space-y-3">
            {[
              ["MLA 9", mlaSegs, segmentsToPlain(mlaSegs), "mla"],
              ["APA 7", apaSegs, segmentsToPlain(apaSegs), "apa"],
            ].map(([label, segs, plain, style], idx) => (
              <div key={style} className={idx > 0 ? "pt-2 border-t border-stone-200" : ""}>
                <div className="flex items-center justify-between mb-1">
                  <span className="mono-font text-[10px] uppercase tracking-widest text-stone-700">
                    {label}
                  </span>
                  <button
                    onClick={() => onCopy(plain, cardId, style)}
                    className="mono-font text-[10px] uppercase tracking-widest text-stone-700 hover:text-red-900 transition"
                  >
                    {copied.id === cardId && copied.style === style ? "✓ Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-xs md:text-sm text-stone-800 leading-relaxed break-words">
                  {segs.map((s, j) =>
                    s.italic ? <em key={j}>{s.text}</em> : <span key={j}>{s.text}</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
