// OpenCITE — useSettings
// Auth-aware user settings. Signed-in users sync to DB via /api/settings (the row is
// AES-256-GCM encrypted server-side); anonymous users fall through to localStorage
// unchanged. Shared localStorage↔DB plumbing lives in useSyncedStore (v0.41 R-300).
// Settings-specific logic — legacy-key migration, the v.31 one-time defaults flip, the
// DEFAULT_SETTINGS-spread merge, and adapter enable/toggle — stays here.

import { useSyncedStore } from "./useSyncedStore.js";
import { DEFAULT_SETTINGS, DEFAULT_CURATED_JOURNALS } from "../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../constants/vocabulary.js";
import { ADAPTERS, isAdapterDefaultEnabled } from "../adapters/index.js";
import { storage } from "../lib/storage.js";

const LEGACY_KEYS = [
  "europeanaKey", "openAlexKey", "openAlexEmail", "crossrefEmail",
  "s2Key", "smithsonianKey", "dplaKey",   // kept ONLY to purge stale bare localStorage entries (not migrated)
  "curatedJournals", "enabledSources", "viewMode",
];

function migrateLegacyKeys() {
  try {
    const eu            = localStorage.getItem("europeanaKey")   || "";
    const openAlexKey   = localStorage.getItem("openAlexKey")    || "";
    const legacyEmail   = localStorage.getItem("openAlexEmail")  || "";
    const crossrefEmail = localStorage.getItem("crossrefEmail")  || legacyEmail || "";
    // v0.34: DPLA/Smithsonian are backend-keyed (env via serverKeys.js) — their user
    // keys are no longer read client-side, so they're not migrated into namespaced
    // settings. They stay in LEGACY_KEYS only so any stale bare localStorage entry is
    // purged. europeanaKey IS still migrated below — it drives the Europeana client
    // fallback (browser → api.europeana.eu direct) until the project-level
    // EUROPEANA_API_KEY env is provisioned. TODO(future sprint): drop europeanaKey once
    // that env key lands (adapter, defaults, Settings field, and this migration).

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

    const migrated = { europeanaKey: eu, openAlexKey, crossrefEmail, curatedJournals, enabledSources, viewMode };
    storage.set("settings", migrated);

    for (const key of LEGACY_KEYS) {
      try { localStorage.removeItem(key); } catch {}
    }

    return migrated;
  } catch {
    return null;
  }
}

// Single namespaced write — shared by load(), syncFromDB(), and save().
const persistLocally = (next) => storage.set("settings", next);

// loadLocal — reads namespaced storage; migrates legacy bare keys on first run; applies
// the v.31 one-time defaults. Returns the seed value, or undefined to keep DEFAULT_SETTINGS.
function loadLocalSettings() {
  try {
    const stored = storage.get("settings");
    let base;
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      base = { ...DEFAULT_SETTINGS, ...stored };
    } else {
      const migrated = migrateLegacyKeys();
      base = migrated ? { ...DEFAULT_SETTINGS, ...migrated } : { ...DEFAULT_SETTINGS };
    }
    // v.31 one-time: enable semantic + synonym ranking for existing users whose saved
    // settings predate the always-on defaults. Flips on once, then respects any later
    // toggle (the flag is persisted alongside their choice).
    if (!base.searchDefaultsV31) {
      base = { ...base, semanticSearch: true, synonyms: true, searchDefaultsV31: true };
      persistLocally(base);
    }
    return base;
  } catch {
    return undefined; // keep DEFAULT_SETTINGS
  }
}

export function useSettings() {
  const { value: settings, setValue: setSettings, loaded, load, user, apiFetch } = useSyncedStore(DEFAULT_SETTINGS, {
    apiPath: "/api/settings",
    loadLocal: loadLocalSettings,
    parse: (body) => body?.settings ?? null,                       // empty DB → first-time push
    pushLocal: (local, push) => push("POST", { settings: local }), // single blob, not per-item
    merge: (db, local) => ({ ...DEFAULT_SETTINGS, ...local, ...db }), // DB wins on conflict
    persist: persistLocally,
  });

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
