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
import { storage } from "../lib/storage.js";

const apiFetch = (method, body) => apiCall("/api/settings", method, body);

const LEGACY_KEYS = [
  "europeanaKey", "openAlexKey", "openAlexEmail", "crossrefEmail",
  "s2Key", "smithsonianKey", "dplaKey", "rijksKey",
  "curatedJournals", "enabledSources", "viewMode",
];

function migrateLegacyKeys() {
  try {
    const eu            = localStorage.getItem("europeanaKey")   || "";
    const openAlexKey   = localStorage.getItem("openAlexKey")    || "";
    const legacyEmail   = localStorage.getItem("openAlexEmail")  || "";
    const crossrefEmail = localStorage.getItem("crossrefEmail")  || legacyEmail || "";
    const s2Key          = localStorage.getItem("s2Key")          || "";
    const smithsonianKey = localStorage.getItem("smithsonianKey") || "";
    const dplaKey        = localStorage.getItem("dplaKey")        || "";
    const rijksKey       = localStorage.getItem("rijksKey")       || "";

    let enabledSources = {};
    try {
      const raw = localStorage.getItem("enabledSources");
      if (raw) { const obj = JSON.parse(raw); if (obj && typeof obj === "object") enabledSources = obj; }
    } catch {}

    let curatedJournals = DEFAULT_CURATED_JOURNALS;
    try {
      const raw = localStorage.getItem("curatedJournals");
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) curatedJournals = arr; }
    } catch {}

    const viewMode = localStorage.getItem("viewMode") || "unified";

    const migrated = { europeanaKey: eu, openAlexKey, crossrefEmail, s2Key, smithsonianKey, dplaKey, rijksKey, curatedJournals, enabledSources, viewMode };
    storage.set("settings", migrated);

    for (const key of LEGACY_KEYS) {
      try { localStorage.removeItem(key); } catch {}
    }

    return migrated;
  } catch {
    return null;
  }
}

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

  // ── load — reads namespaced storage; migrates legacy bare keys on first run ─
  const load = () => {
    try {
      const stored = storage.get("settings");
      let base;
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        base = { ...DEFAULT_SETTINGS, ...stored };
      } else {
        const migrated = migrateLegacyKeys();
        base = migrated ? { ...DEFAULT_SETTINGS, ...migrated } : { ...DEFAULT_SETTINGS };
      }
      // v.31 one-time: enable semantic + synonym ranking for existing users whose
      // saved settings predate the always-on defaults. Flips on once, then respects
      // any later toggle (the flag is persisted alongside their choice).
      if (!base.searchDefaultsV31) {
        base = { ...base, semanticSearch: true, synonyms: true, searchDefaultsV31: true };
        persistLocally(base);
      }
      setSettings(base);
    } catch {}
    setLoaded(true);
  };

  // ── persistLocally — single namespaced write ──────────────────────────────
  const persistLocally = (next) => {
    storage.set("settings", next);
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
