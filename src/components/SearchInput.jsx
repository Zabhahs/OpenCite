import React, { useState, useEffect } from "react";
import { SEARCH_PLACEHOLDER_ITEMS } from "../constants/app.js";

/**
 * SearchInput — preserves original styling exactly.
 * Native placeholder replaced with an animated crossfade overlay.
 * Cycles through SEARCH_PLACEHOLDER_ITEMS from constants/app.js.
 * Overlay disappears the moment the user types.
 */
export function SearchInput({ query, onChange, onSearch, inputRef }) {
  const [idx, setIdx]         = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % SEARCH_PLACEHOLDER_ITEMS.length);
        setVisible(true);
      }, 400);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="mb-10">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder=" "
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSearch()}
          className="w-full bg-transparent border-b-2 border-stone-900 py-4 pr-32 display-font text-xl md:text-2xl text-stone-900 focus:outline-none focus:border-red-900 transition"
          style={{ letterSpacing: "-0.01em" }}
          autoComplete="off"
          spellCheck="false"
          aria-label="Search"
        />

        {/* Animated placeholder — mirrors input font/size/position exactly */}
        {!query && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 right-32 display-font text-xl md:text-2xl text-stone-400 truncate select-none"
            style={{
              letterSpacing: "-0.01em",
              opacity: visible ? 1 : 0,
              transition: "opacity 0.4s ease",
            }}
          >
            {SEARCH_PLACEHOLDER_ITEMS[idx]}
          </span>
        )}

        <button
          onClick={onSearch}
          disabled={!query.trim()}
          className="absolute right-0 top-1/2 -translate-y-1/2 mono-font text-xs uppercase tracking-widest bg-stone-900 text-amber-50 px-5 py-3 hover:bg-red-900 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Search →
        </button>
      </div>
      <p className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mt-2">
        All sources queried in parallel · zero AI tokens
      </p>
    </section>
  );
}
