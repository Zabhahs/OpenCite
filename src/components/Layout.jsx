import React, { useState, useRef, useEffect } from "react";
import { THEMES } from "../constants/themes.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { APP_VERSION, APP_NAME } from "../constants/app.js";

// ---------- AuthButton + SyncTooltip ----------

const PROVIDERS = [
  { id: "google",             label: "Google",    active: true  },
  { id: "apple",              label: "Apple",     active: false },
  { id: "microsoft-entra-id", label: "Microsoft", active: false },
];

const TOOLTIP_KEY = "opencite_sync_tooltip_dismissed";

function AuthButton() {
  const { user, status, signIn, signOut } = useAuth();
  const [open, setOpen]       = useState(false);
  const [tooltip, setTooltip] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (status === "unauthenticated" && !localStorage.getItem(TOOLTIP_KEY)) {
      const t = setTimeout(() => setTooltip(true), 3000);
      return () => clearTimeout(t);
    }
  }, [status]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dismissTooltip = () => {
    localStorage.setItem(TOOLTIP_KEY, "1");
    setTooltip(false);
  };

  const handleOk = () => {
    dismissTooltip();
    setOpen(true);
  };

  if (status === "loading") return null;

  const navBtn = "mono-font text-xs uppercase tracking-widest text-stone-600 hover:text-red-900 transition";

  if (status === "authenticated") {
    const firstName = (user.name ?? "").split(" ")[0] || "user";
    return (
      <div className="relative" ref={ref}>
        <button onClick={() => setOpen(o => !o)} className={navBtn}>
          ● {firstName}
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-2 z-50 bg-white border-2 border-stone-900 min-w-[120px]">
            <button
              onClick={() => { setOpen(false); signOut(); }}
              className="block w-full text-left mono-font text-xs uppercase tracking-widest text-stone-600 hover:text-red-900 hover:bg-stone-50 px-4 py-3 transition"
            >
              ↳ sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { dismissTooltip(); setOpen(o => !o); }} className={navBtn}>
        ↳ sign in
      </button>

      {tooltip && !open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white border-2 border-stone-900 w-[260px] p-4 shadow-sm">
          <p className="display-font text-sm text-stone-800 leading-snug mb-3">
            Sign in to sync your favourites and search history across devices!
          </p>
          <button
            onClick={handleOk}
            className="mono-font text-xs uppercase tracking-widest bg-stone-900 text-amber-50 px-4 py-2 hover:bg-red-900 transition"
          >
            OK — sign in
          </button>
        </div>
      )}

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white border-2 border-stone-900 min-w-[140px]">
          {PROVIDERS.map(p => (
            p.active ? (
              <button
                key={p.id}
                onClick={() => { setOpen(false); signIn(p.id); }}
                className="block w-full text-left mono-font text-xs uppercase tracking-widest text-stone-600 hover:text-red-900 hover:bg-stone-50 px-4 py-3 transition border-b border-stone-100 last:border-0"
              >
                ↳ {p.label}
              </button>
            ) : (
              <div
                key={p.id}
                className="block w-full text-left mono-font text-xs uppercase tracking-widest text-stone-400 px-4 py-3 border-b border-stone-100 last:border-0 cursor-default select-none"
              >
                ↳ {p.label} <span className="text-[9px] tracking-wider">— soon</span>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Header ----------

export function Header({ adapters, onLibrary, onHistory, onSettings, libraryCount, historyCount }) {
  return (
    <header className="mb-10 md:mb-14">
      <div className="flex items-baseline justify-between mb-2">
        <span className="mono-font text-xs uppercase tracking-[0.3em] text-stone-600">
          {APP_VERSION} / {APP_NAME.toLowerCase()}
        </span>
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
          <AuthButton />
        </div>
      </div>
      <div className="border-t-2 border-stone-900 pt-6">
        <h1 className="display-font text-5xl md:text-7xl font-black leading-none text-stone-900 mb-3" style={{ letterSpacing: "-0.02em" }}>
          {APP_NAME}
        </h1>
        <p className="display-font italic text-lg md:text-xl text-stone-700 max-w-xl mb-3">
          A meta-search across free, open-access scholarly databases. Citations ready to paste.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {adapters.map(a => (
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

// ---------- KofiOverlay ----------

export function KofiOverlay() {
  useEffect(() => {
    if (document.getElementById("kofi-overlay-script")) return;
    const script = document.createElement("script");
    script.id = "kofi-overlay-script";
    script.src = "https://storage.ko-fi.com/cdn/scripts/overlay-widget.js";
    script.async = true;
    script.onload = () => {
      if (window.kofiWidgetOverlay) {
        window.kofiWidgetOverlay.draw("313mitra", {
          "type": "floating-chat",
          "floating-chat.donateButton.text": "Support me",
          "floating-chat.donateButton.background-color": "#00b9fe",
          "floating-chat.donateButton.text-color": "#fff",
        });
      }
    };
    document.body.appendChild(script);
  }, []);

  return null;
}

// ---------- ConnectCard ----------

export function ConnectCard() {
  return (
    <section className="mt-16">
      <div className="grid md:grid-cols-2 gap-4">

        <a
          href="https://ko-fi.com/L3L31YYTKM"
          target="_blank"
          rel="noopener noreferrer"
          className="group block p-6 border-2 border-stone-200 hover:border-[#00b9fe] bg-white hover:bg-blue-50/30 transition-all duration-200 no-underline"
        >
          <div className="flex items-start gap-4">
            <div
              className="flex-shrink-0 w-11 h-11 flex items-center justify-center text-2xl rounded-sm"
              style={{ backgroundColor: "#00b9fe" }}
            >
              ☕
            </div>
            <div>
              <h3 className="display-font text-base font-bold text-stone-900 mb-1 group-hover:text-[#00b9fe] transition-colors">
                Support on Ko-fi
              </h3>
              <p className="display-font italic text-sm text-stone-600 leading-snug mb-3">
                Support dev &amp; hosting costs!
              </p>
              <span
                className="inline-block mono-font text-[10px] uppercase tracking-widest px-3 py-1.5 transition group-hover:opacity-90"
                style={{ backgroundColor: "#00b9fe", color: "#fff" }}
              >
                ☕ buy a coffee ↗
              </span>
            </div>
          </div>
        </a>

        <a
          href="https://www.linkedin.com/in/shahbaz-yusuf/"
          target="_blank"
          rel="noopener noreferrer"
          className="group block p-6 border-2 border-stone-200 hover:border-stone-900 bg-white hover:bg-stone-50 transition-all duration-200 no-underline"
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-11 h-11 flex items-center justify-center text-xl bg-[#0077b5] text-white rounded-sm">
              in
            </div>
            <div>
              <h3 className="display-font text-base font-bold text-stone-900 mb-1 group-hover:text-[#0077b5] transition-colors">
                Shahbaz Yusuf
              </h3>
              <p className="display-font italic text-sm text-stone-600 leading-snug mb-3">
                Connect with the creator on LinkedIn!
              </p>
              <span className="inline-block mono-font text-[10px] uppercase tracking-widest bg-stone-900 text-amber-50 px-3 py-1.5 group-hover:bg-[#0077b5] transition-colors">
                connect ↗
              </span>
            </div>
          </div>
        </a>

      </div>
    </section>
  );
}
