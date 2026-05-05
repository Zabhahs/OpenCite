import React from "react";

export function SearchInput({ query, onChange, onSearch, inputRef }) {
  return (
    <section className="mb-10">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSearch()}
          placeholder="The only good is knowledge, Sekhandur. The only evil is ignorance."
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
    </section>
  );
}
