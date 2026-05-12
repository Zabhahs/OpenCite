// OpenCITE — useLibrary
// Auth-aware: signed-in users sync to DB via /api/library (fire-and-forget writes).
// Anonymous users fall through to localStorage via lib/library.js — unchanged behaviour.
//
// Sync strategy mirrors useSettings:
//   load()       — reads localStorage (fast, offline-safe), called once on mount
//   syncFromDB() — called when user signs in; DB wins on conflict
//   toggle/clear — writes localStorage always + fire-and-forget POST if signed in

import { useState, useEffect, useRef } from "react";
import { library, libraryKey } from "../lib/library.js";
import { buildMLA, buildAPA, segmentsToPlain } from "../lib/citations.js";
import { useAuth } from "../contexts/AuthContext.jsx";

const API = "/api/library";

async function apiFetch(method, body) {
  return fetch(API, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export function useLibrary() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Always-current ref so syncFromDB() never reads stale closure values
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // ── Sync from DB when user signs in (and local state is ready) ────────────
  useEffect(() => {
    if (user?.id && loaded) syncFromDB();
  }, [user?.id, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── syncFromDB — fires once on sign-in ────────────────────────────────────
  const syncFromDB = async () => {
    try {
      const res = await apiFetch("GET");
      if (!res.ok) return;
      const rows = await res.json(); // [{ ...result, savedAt }]

      if (!rows || rows.length === 0) {
        // No DB record yet — push current localStorage items up (first-time sync)
        const local = itemsRef.current;
        local.forEach(item => apiFetch("POST", { result: item })); // fire-and-forget
        return;
      }

      // DB wins — update state and localStorage
      setItems(rows);
      try {
        const { storage } = await import("../lib/storage.js");
        storage.set("library", rows);
      } catch {}
    } catch {
      // Network error — stay on localStorage silently
    }
  };

  // ── load — localStorage read (called once on mount by App.jsx) ─────────────
  const load = () => {
    const raw = library.load();
    setItems(raw);
    setLoaded(true);
  };

  // ── isInLibrary ───────────────────────────────────────────────────────────
  const isInLibrary = (result) =>
    items.some(item => libraryKey(item) === libraryKey(result));

  // ── toggle ────────────────────────────────────────────────────────────────
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

  // ── exportBibliography — kept for backwards compat (App.jsx may call it) ──
  const exportBibliography = () => {
    if (items.length === 0) return;
    const lines = [
      "OPENCITE LIBRARY EXPORT",
      `Generated ${new Date().toLocaleString()}`,
      `${items.length} item${items.length !== 1 ? "s" : ""}`,
      "",
      "=== MLA 9 ===", "",
      ...items.flatMap(item => [segmentsToPlain(buildMLA(item)), ""]),
      "",
      "=== APA 7 ===", "",
      ...items.flatMap(item => [segmentsToPlain(buildAPA(item)), ""]),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opencite-library-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── clear ─────────────────────────────────────────────────────────────────
  const clear = () => {
    const next = library.clear();
    setItems(next);
    if (user) apiFetch("DELETE", { clear: true }); // non-blocking
    return next;
  };

  return { items, load, isInLibrary, toggle, exportBibliography, clear };
}
