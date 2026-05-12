// OpenCITE — useHistory
// Auth-aware: signed-in users sync to DB via /api/history (fire-and-forget writes).
// Anonymous users fall through to localStorage via lib/history.js — unchanged behaviour.
//
// Sync strategy mirrors useSettings:
//   load()       — reads localStorage (fast, offline-safe), called once on mount
//   syncFromDB() — called when user signs in; DB wins on conflict
//   add/remove/clear — writes localStorage always + fire-and-forget POST if signed in

import { useState, useEffect, useRef } from "react";
import { history } from "../lib/history.js";
import { useAuth } from "../contexts/AuthContext.jsx";

const API = "/api/history";

async function apiFetch(method, body) {
  return fetch(API, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export function useHistory() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Always-current ref so syncFromDB() never reads stale closure values
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  // ── Sync from DB when user signs in (and local state is ready) ────────────
  useEffect(() => {
    if (user?.id && loaded) syncFromDB();
  }, [user?.id, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── syncFromDB — fires once on sign-in ────────────────────────────────────
  const syncFromDB = async () => {
    try {
      const res = await apiFetch("GET");
      if (!res.ok) return;
      const rows = await res.json();

      if (!rows || rows.length === 0) {
        // No DB record yet — push current localStorage entries up (first-time sync)
        const local = entriesRef.current;
        local.forEach(e => apiFetch("POST", { query: e.query })); // fire-and-forget
        return;
      }

      // DB wins — update state and localStorage
      setEntries(rows);
      try {
        const { storage } = await import("../lib/storage.js");
        storage.set("history", rows);
      } catch {}
    } catch {
      // Network error — stay on localStorage silently
    }
  };

  // ── load — localStorage read (called once on mount by App.jsx) ─────────────
  const load = () => {
    const raw = history.load();
    setEntries(raw);
    setLoaded(true);
  };

  // ── add ───────────────────────────────────────────────────────────────────
  const add = (query) => {
    const next = history.add(query);
    setEntries(next);
    if (user) apiFetch("POST", { query }); // non-blocking
    return next;
  };

  // ── remove ────────────────────────────────────────────────────────────────
  const remove = (query) => {
    const next = history.remove(query);
    setEntries(next);
    if (user) apiFetch("DELETE", { query }); // non-blocking
    return next;
  };

  // ── clear ─────────────────────────────────────────────────────────────────
  const clear = () => {
    const next = history.clear();
    setEntries(next);
    if (user) apiFetch("DELETE", { clear: true }); // non-blocking
    return next;
  };

  return { entries, load, add, remove, clear };
}
