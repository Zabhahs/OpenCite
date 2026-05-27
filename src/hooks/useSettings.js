// OpenCITE — useSettings
// Auth-aware: signed-in users sync to DB via /api/settings (AES-256-GCM encrypted).
// Anonymous users fall through to localStorage — unchanged behaviour.
//
// Sync strategy:
//   load()       — reads localStorage (fast, offline-safe)
//   syncFromDB() — called when user signs in; DB wins on conflict; pushes
//                  localStorage settings up if DB is empty (first-time sync)
//   save(next)   — writes localStorage always + fire-and-forget POST if signed in

import { useState, useEffect, useRef } from "react";
import { DEFAULT_SETTINGS, DEFAULT_CURATED_JOURNALS } from "../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../constants/vocabulary.js";
import { ADAPTERS, isAdapterDefaultEnabled } from "../adapters/index.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiCall } from "../lib/api.js";

const apiFetch = (method, body) => apiCall("/api/settings", method, body);

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded]     = useState(false);
  const { user }                = useAuth();

  // Always-current ref so syncFromDB() never reads stale closure values
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // ── Sync from DB when user signs in (and local state is ready) ────────────
  useEffect(() => {
    if (user?.id && loaded) syncFromDB();
  }, [user?.id, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── load — localStorage read (called once on mount by App.jsx) ─────────────
  const load = () => {
    try {
      const eu            = localStorage.getItem("europeanaKey")   || "";
      const openAlexKey   = localStorage.getItem("openAlexKey")    || "";
      const legacyEmail   = localStorage.getItem("openAlexEmail")  || "";
      const crossrefEmail = localStorage.getItem("crossrefEmail")  || legacyEmail || "";
      if (legacyEmail && !localStorage.getItem("crossrefEmail")) {
        try { localStorage.setItem("crossrefEmail", legacyEmail); localStorage.removeItem("openAlexEmail"); } catch {}
      }
      const s2Key          = localStorage.getItem("s2Key")          || "";
      const smithsonianKey = localStorage.getItem("smithsonianKey") || "";
      const dplaKey        = localStorage.getItem("dplaKey")        || "";
      const rijksKey       = localStorage.getItem("rijksKey")       || "";
      let enabledSources   = {};
      try {
        const raw = localStorage.getItem("enabledSources");
        if (raw) { const obj = JSON.parse(raw); if (obj && typeof obj === "object") enabledSources = obj; }
      } catch {}
      let curatedJournals = DEFAULT_CURATED_JOURNALS;
      try {
        const raw = localStorage.getItem("curatedJournals");
        if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) curatedJournals = arr; }
      } catch {}
      let viewMode = "unified";
      try { viewMode = localStorage.getItem("viewMode") || "unified"; } catch {}
      setSettings({ europeanaKey: eu, openAlexKey, crossrefEmail, s2Key, smithsonianKey, dplaKey, rijksKey, curatedJournals, enabledSources, viewMode });
    } catch {}
    setLoaded(true);
  };

  // ── persistLocally — localStorage write without triggering DB call ─────────
  const persistLocally = (next) => {
    try {
      localStorage.setItem("europeanaKey",    next.europeanaKey    || "");
      localStorage.setItem("openAlexKey",     next.openAlexKey     || "");
      localStorage.setItem("crossrefEmail",   next.crossrefEmail   || "");
      localStorage.setItem("s2Key",           next.s2Key           || "");
      localStorage.setItem("smithsonianKey",  next.smithsonianKey  || "");
      localStorage.setItem("dplaKey",         next.dplaKey         || "");
      localStorage.setItem("rijksKey",        next.rijksKey        || "");
      localStorage.setItem("curatedJournals", JSON.stringify(next.curatedJournals  || []));
      localStorage.setItem("enabledSources",  JSON.stringify(next.enabledSources   || {}));
      if (next.viewMode) localStorage.setItem("viewMode", next.viewMode);
    } catch {}
  };

  // ── syncFromDB — fires once on sign-in ────────────────────────────────────
  const syncFromDB = async () => {
    try {
      const res = await apiFetch("GET");
      if (!res.ok) return;
      const { settings: dbSettings } = await res.json();

      if (!dbSettings) {
        // No DB record yet — push current localStorage settings up (first-time sync)
        apiFetch("POST", { settings: settingsRef.current }); // fire-and-forget
        return;
      }

      // DB wins on conflict — merge: defaults → localStorage → DB
      const merged = { ...DEFAULT_SETTINGS, ...settingsRef.current, ...dbSettings };
      setSettings(merged);
      persistLocally(merged);
    } catch {
      // Network error — stay on localStorage silently
    }
  };

  // ── save — always writes localStorage + DB if signed in ───────────────────
  const save = (next) => {
    setSettings(next);
    persistLocally(next);
    if (user) apiFetch("POST", { settings: next }); // non-blocking
  };

  // ── isEnabled / toggleAdapter — unchanged ─────────────────────────────────
  const isEnabled = (adapter) => {
    const override = settings.enabledSources?.[adapter.id];
    if (typeof override === "boolean") return override;
    return isAdapterDefaultEnabled(adapter);
  };

  const toggleAdapter = (adapterId) => {
    const adapter = ADAPTERS.find(a => a.id === adapterId);
    if (!adapter || adapter.category === ADAPTER_CATEGORY.CORE) return;
    save({ ...settings, enabledSources: { ...settings.enabledSources, [adapterId]: !isEnabled(adapter) } });
  };

  return { settings, save, load, loaded, isEnabled, toggleAdapter };
}
