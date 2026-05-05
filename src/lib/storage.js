import { STORAGE_NS } from "../constants/defaults.js";

const ns = (key) => `${STORAGE_NS}:${key}`;

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(ns(key));
      if (raw === null) return fallback;
      try { return JSON.parse(raw); } catch { return raw; }
    } catch { return fallback; }
  },
  set(key, value) {
    try {
      const serialized = typeof value === "string" ? value : JSON.stringify(value);
      localStorage.setItem(ns(key), serialized);
    } catch {}
  },
  remove(key) {
    try { localStorage.removeItem(ns(key)); } catch {}
  }
};
