import { storage } from "./storage.js";
import { HISTORY_MAX } from "../constants/defaults.js";

export const history = {
  load() {
    const raw = storage.get("history", []);
    return Array.isArray(raw) ? raw : [];
  },
  add(query) {
    const q = (query || "").trim();
    if (!q) return history.load();
    const existing = history.load();
    const filtered = existing.filter(e => e.query !== q);
    const next = [{ query: q, ts: Date.now() }, ...filtered].slice(0, HISTORY_MAX);
    storage.set("history", next);
    return next;
  },
  remove(query) {
    const next = history.load().filter(e => e.query !== query);
    storage.set("history", next);
    return next;
  },
  clear() {
    storage.set("history", []);
    return [];
  }
};
