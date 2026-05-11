import React, { useState, useEffect } from "react";
import { SEARCH_PLACEHOLDER_ITEMS } from "../constants/app.js";

export function SearchInput({ query, onChange, onSearch, inputRef }) {
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  // Cycle placeholder every 3.5 s — only visible when input is empty
  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % SEARCH_PLACEHOLDER_ITEMS.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="mb-10"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "var(--ui-surface)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        marginLeft: "-1.5rem",
        marginRight: "-1.5rem",
        paddingLeft: "1.5rem",
        paddingRight: "1.5rem",
        paddingTop: "0.75rem",
        paddingBottom: "0.75rem",
      }}
    >
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSearch()}
          placeholder={SEARCH_PLACEHOLDER_ITEMS[placeholderIdx]}
          className="w-full bg-transparent border-b-2 border-stone-900 py-4 pr-32 display-font text-xl md:text-2xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-red-900 transition"
          style={{ letterSpacing: "-0.01em" }}
        />
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
    </div>
  );
}
