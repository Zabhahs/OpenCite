// OpenCITE — useHistory
// Auth-aware search history. Signed-in users sync to DB via /api/history
// (fire-and-forget writes); anonymous users fall through to localStorage
// (lib/history.js) unchanged. Shared localStorage↔DB plumbing lives in
// useSyncedStore (v0.41 R-300); only the history-specific mutations are here.

import { useSyncedStore } from "./useSyncedStore.js";
import { history } from "../lib/history.js";
import { storage } from "../lib/storage.js";

export function useHistory() {
  const { value: entries, setValue: setEntries, load, user, apiFetch } = useSyncedStore([], {
    apiPath: "/api/history",
    loadLocal: () => history.load(),
    parse: (rows) => (rows && rows.length ? rows : null), // empty DB → first-time push
    pushLocal: (local, push) => local.forEach(e => push("POST", { query: e.query })),
    merge: (dbRows) => dbRows, // DB wins
    persist: (rows) => storage.set("history", rows),
  });

  const add = (query) => {
    const next = history.add(query);
    setEntries(next);
    if (user) apiFetch("POST", { query }); // non-blocking
    return next;
  };

  const remove = (query) => {
    const next = history.remove(query);
    setEntries(next);
    if (user) apiFetch("DELETE", { query }); // non-blocking
    return next;
  };

  const clear = () => {
    const next = history.clear();
    setEntries(next);
    if (user) apiFetch("DELETE", { clear: true }); // non-blocking
    return next;
  };

  return { entries, load, add, remove, clear };
}
