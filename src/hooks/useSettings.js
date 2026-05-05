import { useState } from "react";
import { DEFAULT_SETTINGS, DEFAULT_CURATED_JOURNALS } from "../constants/defaults.js";
import { ADAPTERS, isAdapterDefaultEnabled } from "../adapters/index.js";

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  const load = () => {
    try {
      const eu = localStorage.getItem("europeanaKey") || "";
      const openAlexKey = localStorage.getItem("openAlexKey") || "";
      // Backward-compat: migrate openAlexEmail → crossrefEmail
      const legacyEmail = localStorage.getItem("openAlexEmail") || "";
      const crossrefEmail = localStorage.getItem("crossrefEmail") || legacyEmail || "";
      if (legacyEmail && !localStorage.getItem("crossrefEmail")) {
        try { localStorage.setItem("crossrefEmail", legacyEmail); localStorage.removeItem("openAlexEmail"); } catch {}
      }
      const s2Key = localStorage.getItem("s2Key") || "";
      const smithsonianKey = localStorage.getItem("smithsonianKey") || "";
      const dplaKey = localStorage.getItem("dplaKey") || "";
      const rijksKey = localStorage.getItem("rijksKey") || "";
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
      setSettings({ europeanaKey: eu, openAlexKey, crossrefEmail, s2Key, smithsonianKey, dplaKey, rijksKey, curatedJournals, enabledSources });
    } catch {}
    setLoaded(true);
  };

  const save = (next) => {
    setSettings(next);
    try {
      localStorage.setItem("europeanaKey", next.europeanaKey || "");
      localStorage.setItem("openAlexKey", next.openAlexKey || "");
      localStorage.setItem("crossrefEmail", next.crossrefEmail || "");
      localStorage.setItem("s2Key", next.s2Key || "");
      localStorage.setItem("smithsonianKey", next.smithsonianKey || "");
      localStorage.setItem("dplaKey", next.dplaKey || "");
      localStorage.setItem("rijksKey", next.rijksKey || "");
      localStorage.setItem("curatedJournals", JSON.stringify(next.curatedJournals || []));
      localStorage.setItem("enabledSources", JSON.stringify(next.enabledSources || {}));
    } catch {}
  };

  const isEnabled = (adapter) => {
    const override = settings.enabledSources?.[adapter.id];
    if (typeof override === "boolean") return override;
    return isAdapterDefaultEnabled(adapter);
  };

  const toggleAdapter = (adapterId) => {
    const adapter = ADAPTERS.find(a => a.id === adapterId);
    if (!adapter || adapter.category === "core") return;
    save({ ...settings, enabledSources: { ...settings.enabledSources, [adapterId]: !isEnabled(adapter) } });
  };

  return { settings, save, load, loaded, isEnabled, toggleAdapter };
}
