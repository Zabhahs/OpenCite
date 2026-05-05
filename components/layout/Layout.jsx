import React from "react";
import { ADAPTERS } from "../../adapters/index.js";
import { THEMES } from "../../constants/themes.js";

// ---------- Header ----------

export function Header({ onLibrary, onHistory, onSettings, libraryCount, historyCount, activePanel }) {
  const btn = (panel, label) => (
    <button
      onClick={() => (activePanel === panel ? onLibrary(null) : { library: onLibrary, history: onHistory, settings: onSettings }[panel](panel))}
      className="mono-font text-xs uppercase tracking-widest text-stone-600 hover:text-red-900 transition"
    >
      {label}
    </button>
  );

  return (
    <header className="mb-10 md:mb-14">
      <div className="flex items-baseline justify-between mb-2">
        <span className="mono-font text-xs uppercase tracking-[0.3em] text-stone-600">v.13 / opencite</span>
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={onLibrary} className="mono-font text-xs uppercase tracking-widest text-stone-600 hover:text-red-900 transition">
            ★ library{libraryCount > 0 ? ` (${libraryCount})` : ""}
          </button>
          <button onClick={onHistory} className="mono-font text-xs uppercase tracking-widest text-stone-600 hover:text-red-900 transition">
            ↻ history{historyCount > 0 ? ` (${historyCount})` : ""}
          </button>
          <button onClick={onSettings} className="mono-font text-xs uppercase tracking-widest text-stone-600 hover:text-red-900 transition">
            ⚙ settings
          </button>
        </div>
      </div>
      <div className="border-t-2 border-stone-900 pt-6">
        <h1 className="display-font text-5xl md:text-7xl font-black leading-none text-stone-900 mb-3" style={{ letterSpacing: "-0.02em" }}>
          OpenCITE
        </h1>
        <p className="display-font italic text-lg md:text-xl text-stone-700 max-w-xl mb-3">
          A meta-search across free, open-access scholarly databases. Citations ready to paste.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {ADAPTERS.map(a => (
            <span key={a.id} className={`mono-font text-[10px] uppercase tracking-widest ${a.color.bg} ${a.color.text} px-2 py-1`}>{a.name}</span>
          ))}
        </div>
      </div>
    </header>
  );
}

// ---------- ThemeStrip ----------

export function ThemeStrip({ themeKey, onChange }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="mono-font text-[10px] uppercase tracking-widest text-stone-600">Theme</span>
      {Object.entries(THEMES).map(([key, t]) => (
        <button key={key} onClick={() => onChange(key)}
          title={t.label}
          className={`w-5 h-5 border-2 transition ${themeKey === key ? "border-stone-900" : "border-transparent hover:border-stone-400"}`}
          style={{ background: t.swatch }} />
      ))}
    </div>
  );
}

// ---------- Footer ----------

export function Footer() {
  return (
    <footer className="mt-12 pt-6 border-t border-stone-400">
      <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 leading-relaxed">
        Always verify citations against the original source · Italics may need reapplying after paste · Built to be hostable + extensible
      </p>
    </footer>
  );
}

// ---------- ConnectCard ----------

export function ConnectCard() {
  return (
    <section className="mt-16">
      <details className="group border-2 border-stone-900 bg-amber-50/40 transition">
        <summary className="cursor-pointer list-none flex items-center justify-between p-5 hover:bg-amber-100/40 transition">
          <div>
            <h3 className="display-font text-xl md:text-2xl font-bold text-stone-900 leading-tight">Connect with the maker</h3>
            <p className="display-font italic text-sm text-stone-600 mt-1">Building OpenCITE and other tools — let's talk.</p>
          </div>
          <span className="mono-font text-xs uppercase tracking-widest text-stone-700 ml-4 transition group-open:rotate-180 inline-block">▾</span>
        </summary>
        <div className="border-t border-stone-300 p-5 md:p-6 grid md:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <p className="display-font text-stone-800 mb-3 leading-relaxed">
              OpenCITE is built by Shahbaz Yusuf — open to collaboration, feature ideas, or just a hello from a fellow researcher or builder.
            </p>
            <p className="display-font italic text-stone-600 mb-5 leading-relaxed text-sm">
              If this tool saved you time, the kindest thing you can do is connect — building in public is more fun with company.
            </p>
            <a href="https://www.linkedin.com/in/shahbaz-yusuf/" target="_blank" rel="noopener noreferrer"
              className="inline-block mono-font text-xs uppercase tracking-widest bg-stone-900 text-amber-50 px-5 py-3 hover:bg-red-900 transition">
              Connect on LinkedIn ↗
            </a>
          </div>
          <div className="flex flex-col items-center">
            <img src="/opencite-linkedin-qr.jpeg" alt="QR code linking to Shahbaz Yusuf's LinkedIn profile"
              className="w-36 h-36 md:w-40 md:h-40 border-2 border-stone-900 bg-white p-1" />
            <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 mt-2">scan to connect</p>
          </div>
        </div>
      </details>
    </section>
  );
}
