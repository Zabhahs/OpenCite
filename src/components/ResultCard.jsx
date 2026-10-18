// OpenCITE — ResultCard
// Displays a single search result with citation, save, and copy functionality.
// v.17: book-chapter awareness, editors, enrichment metadata display.
// v0.44: memoized (React.memo + useMemo'd citation builds) — long unified lists
// re-render on every copy/save state change; cards whose props are unchanged skip.

import React, { useState, useMemo } from "react";
import { buildMLA, buildAPA, segmentsToPlain, isBookChapter } from "../lib/citations.js";
import { truncate } from "../lib/helpers.js";
import { EagleTooltip } from "./EagleTooltip.jsx";
import { useEagleTooltip } from "../hooks/useEagleTooltip.js";
// v0.50 — search data capture: every user action on a card is a relevance signal (lib/telemetry.js
// no-ops when the setting is off or no search event is live). Editions are stripped first so the
// signal names the record itself.
import { emitSignal, startResultDwell, SIGNAL } from "../lib/telemetry.js";

const EAGLE_LIBRARY_MSG =
  "Saved! ★ Open your Library to select favourites and export them as BibTeX, RIS, or CSL-JSON.";

// libraryCheck — optional (record) → bool, passed only for cards carrying `_editions`
// (groupResults.collapseEditions) so each nested edition card resolves its own saved state;
// `isInLibrary` stays a precomputed boolean for this card.
export const ResultCard = React.memo(function ResultCard({ result, index, onCopy, copied, isInLibrary, onToggleLibrary, isChapterInGroup, libraryCheck }) {
  const mlaSegs = useMemo(() => buildMLA(result), [result]);
  const apaSegs = useMemo(() => buildAPA(result), [result]);
  const cardId = result.id;
  const [imgFailed, setImgFailed] = useState(false);
  const [citationsOpen, setCitationsOpen] = useState(false);
  const [editionsOpen, setEditionsOpen] = useState(false);
  const editions = result._editions || [];
  // "older" only when every folded edition predates this one; otherwise (missing/equal year) "other".
  const editionsLabel = editions.every((e) => (parseInt(e.year, 10) || 0) < (parseInt(result.year, 10) || 0))
    ? "older" : "other";
  const hasImage = result.previewImage && !imgFailed;
  const chapter = isBookChapter(result);

  // Eagle tooltip — one-time, triggered on first ever library save
  const eagle = useEagleTooltip("eagle_library_prompted");

  // Save the record itself, not the editions folded onto it for display.
  const { _editions, ...record } = result;

  const handleToggleLibrary = () => {
    if (!isInLibrary) {
      eagle.show();
      emitSignal(record, SIGNAL.save_library); // v0.50 — add only; un-saving is not a signal
    }
    onToggleLibrary(record);
  };
  // v0.50 — outbound click: signal + start the result-dwell clock (settles when the tab refocuses).
  const handleOpen = (action, meta) => { emitSignal(record, action, meta); startResultDwell(record); };

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
        {/* v.17 — type badge for non-article types */}
        {chapter && (
          <span className="mono-font text-[9px] uppercase tracking-widest bg-stone-200 text-stone-700 px-1.5 py-0.5">
            chapter
          </span>
        )}
        {!result.isOA && (
          <span className="mono-font text-[10px] uppercase tracking-widest text-amber-900">
            may be paywalled
          </span>
        )}

        {/* Star save button */}
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

      {/* Eagle tooltip */}
      <EagleTooltip {...eagle.props} message={EAGLE_LIBRARY_MSG} />

      <div className={hasImage ? "grid grid-cols-[120px_1fr] md:grid-cols-[160px_1fr] gap-4 md:gap-5" : ""}>
        {hasImage && (
          <div className="shrink-0">
            <a href={result.url || result.previewImage} target="_blank" rel="noopener noreferrer" onClick={() => handleOpen(SIGNAL.open_link, { via: "image" })}>
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
            {(result.doi || result.url) ? (
              <a
                href={result.doi ? `https://doi.org/${result.doi}` : result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline hover:text-red-900 transition"
                onClick={() => handleOpen(SIGNAL.click_title, { via: result.doi ? "doi" : "url" })}
              >
                {result.title}
              </a>
            ) : result.title}
          </h4>

          {/* v.17 — Book title subheader for chapters NOT already inside a group wrapper */}
          {chapter && !isChapterInGroup && result.journal && (
            <p className="display-font text-sm text-stone-700 mb-1 break-words">
              In: <em>{result.journal}</em>
            </p>
          )}

          {result.authors?.length > 0 && (
            <p className="display-font italic text-sm text-stone-700 mb-1 break-words">
              {result.authors.slice(0, 4).join(", ")}
              {result.authors.length > 4 ? ", et al." : ""}
            </p>
          )}

          {/* v.17 — Editors */}
          {result.editors?.length > 0 && (
            <p className="display-font text-sm text-stone-600 mb-1 break-words">
              Ed. {result.editors.slice(0, 3).join(", ")}
              {result.editors.length > 3 ? ", et al." : ""}
            </p>
          )}

          {(result.journal || result.publisher) && !isChapterInGroup && (
            <p className="mono-font text-[10px] uppercase tracking-wider text-stone-600 mb-2 break-words">
              {/* For chapters already showing journal as "In: ...", show publisher only */}
              {chapter && result.journal ? result.publisher : (result.journal || result.publisher)}
            </p>
          )}

          {/* v.17 — Enrichment metadata row */}
          {(result.citedBy != null || result.keywords?.length > 0 || result.subjects?.length > 0 || result.language) && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {result.citedBy != null && result.citedBy > 0 && (
                <span className="mono-font text-[9px] uppercase tracking-widest bg-amber-100 text-amber-800 px-1.5 py-0.5">
                  {result.citedBy.toLocaleString()} {result.source === "IA" ? "downloaded" : "cited"}
                </span>
              )}
              {result.language && (
                <span className="mono-font text-[9px] uppercase tracking-widest bg-stone-200 text-stone-600 px-1.5 py-0.5">
                  {result.language}
                </span>
              )}
              {(result.keywords || []).slice(0, 3).map((kw, ki) => (
                <span key={ki} className="mono-font text-[9px] uppercase tracking-widest bg-stone-100 text-stone-600 px-1.5 py-0.5">
                  {kw}
                </span>
              ))}
              {(result.subjects || []).slice(0, 2).map((s, si) => (
                <span key={si} className="mono-font text-[9px] uppercase tracking-widest bg-emerald-100 text-emerald-800 px-1.5 py-0.5">
                  {s}
                </span>
              ))}
            </div>
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
          onClick={() => handleOpen(SIGNAL.open_link, { via: "fulltext" })}
        >
          Read full text →
        </a>
      )}

      {/* Citations — MLA + APA */}
      <div className="border border-stone-300 bg-white">
        <button
          onClick={() => { if (!citationsOpen) emitSignal(record, SIGNAL.expand_cite); setCitationsOpen((o) => !o); }}
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
                    onClick={() => { emitSignal(record, SIGNAL.copy_cite, { style }); onCopy(plain, cardId, style); }}
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

      {/* Editions — older editions of this work folded into one card (collapseEditions).
          Each opens as a full nested card so it keeps its own link, citation and save. */}
      {editions.length > 0 && (
        <div className="border border-t-0 border-stone-300 bg-white">
          <button
            onClick={() => setEditionsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-stone-50 transition"
            aria-expanded={editionsOpen}
          >
            <span className="mono-font text-[10px] uppercase tracking-widest text-stone-600">
              {editions.length} {editionsLabel} edition{editions.length !== 1 ? "s" : ""}
              {editions.some((e) => e.year) && (
                <span className="text-stone-400">
                  {" · "}{editions.map((e) => e.year).filter(Boolean).join(", ")}
                </span>
              )}
            </span>
            <span className="mono-font text-[10px] text-stone-400 ml-2">
              {editionsOpen ? "↑ hide" : "↓ expand"}
            </span>
          </button>

          {editionsOpen && (
            <div className="border-t border-stone-200 p-3 space-y-4">
              {editions.map((ed) => (
                <ResultCard
                  key={ed.id}
                  result={ed}
                  index={index}
                  onCopy={onCopy}
                  copied={copied}
                  isInLibrary={libraryCheck ? libraryCheck(ed) : false}
                  onToggleLibrary={onToggleLibrary}
                  isChapterInGroup={isChapterInGroup}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
});
