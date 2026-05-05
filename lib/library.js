import { storage } from "./storage.js";

export const libraryKey = (result) => {
  if (result.doi) return `doi:${result.doi.toLowerCase()}`;
  return `${result.source}:${result.id}`;
};

export const library = {
  load() {
    const raw = storage.get("library", []);
    return Array.isArray(raw) ? raw : [];
  },
  has(result) {
    const key = libraryKey(result);
    return library.load().some(item => libraryKey(item) === key);
  },
  add(result) {
    const existing = library.load();
    const key = libraryKey(result);
    if (existing.some(item => libraryKey(item) === key)) return existing;
    const next = [{ ...result, savedAt: Date.now() }, ...existing];
    storage.set("library", next);
    return next;
  },
  remove(result) {
    const key = libraryKey(result);
    const next = library.load().filter(item => libraryKey(item) !== key);
    storage.set("library", next);
    return next;
  },
  clear() {
    storage.set("library", []);
    return [];
  }
};
