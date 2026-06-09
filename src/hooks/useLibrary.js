// OpenCITE — useLibrary
// Auth-aware saved library. Signed-in users sync to DB via /api/library
// (fire-and-forget writes); anonymous users fall through to localStorage
// (lib/library.js) unchanged. Shared localStorage↔DB plumbing lives in
// useSyncedStore (v0.41 R-300); only the library-specific mutations are here.

import { useSyncedStore } from "./useSyncedStore.js";
import { library, libraryKey } from "../lib/library.js";
import { storage } from "../lib/storage.js";

export function useLibrary() {
  const { value: items, setValue: setItems, load, user, apiFetch } = useSyncedStore([], {
    apiPath: "/api/library",
    loadLocal: () => library.load(),
    parse: (rows) => (rows && rows.length ? rows : null), // empty DB → first-time push
    pushLocal: (local, push) => local.forEach(item => push("POST", { result: item })),
    merge: (dbRows) => dbRows, // DB wins; rows are [{ ...result, savedAt }]
    persist: (rows) => storage.set("library", rows),
  });

  const isInLibrary = (result) =>
    items.some(item => libraryKey(item) === libraryKey(result));

  const toggle = (result) => {
    if (isInLibrary(result)) {
      const next = library.remove(result);
      setItems(next);
      if (user) apiFetch("DELETE", { library_key: libraryKey(result) }); // non-blocking
    } else {
      const next = library.add(result);
      setItems(next);
      if (user) apiFetch("POST", { result }); // non-blocking
    }
  };

  const clear = () => {
    const next = library.clear();
    setItems(next);
    if (user) apiFetch("DELETE", { clear: true }); // non-blocking
    return next;
  };

  return { items, load, isInLibrary, toggle, clear };
}
