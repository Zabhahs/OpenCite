// OpenCITE — useSyncedStore
// Shared localStorage↔DB sync plumbing for the auth-aware hooks (R-300, v0.41).
//
// useHistory, useLibrary, and useSettings all repeated the same 4-step lifecycle:
//   1. load()       — read localStorage once on mount (fast, offline-safe).
//   2. useEffect([user?.id, loaded]) → syncFromDB() when the user signs in.
//   3. syncFromDB() — GET; if the DB is empty, push local up (first-time sync);
//                     otherwise the DB wins and we commit + persist its value.
//   4. mutations    — write localStorage always + fire-and-forget the API if signed in.
//
// Only the *shapes* differed, so they are injected via the config object below. Each
// consumer keeps its own mutation methods (add/toggle/save/…) and just calls this for
// the shared plumbing. Behaviour is identical to the pre-extraction hooks.
//
// Config:
//   apiPath            — REST path, e.g. "/api/history".
//   loadLocal()        — read the initial value from localStorage (sync). May have side
//                        effects (e.g. legacy migration). Return the value to seed state.
//   parse(body)        — map the raw GET body to a value, or null/undefined if the DB
//                        row is empty (→ triggers a first-time push instead).
//   pushLocal(local, apiFetch) — push the current local value up when the DB is empty.
//   merge(dbValue, local)      — value to commit when the DB wins.
//   persist(value)     — write the committed value back to localStorage.
//
// Returns { value, setValue, valueRef, loaded, load, user, apiFetch } — `valueRef` is
// the always-current ref so mutations/sync never read a stale closure value.

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiCall } from "../lib/api.js";

export function useSyncedStore(initialValue, { apiPath, loadLocal, parse, pushLocal, merge, persist }) {
  const { user } = useAuth();
  const [value, setValue] = useState(initialValue);
  const [loaded, setLoaded] = useState(false);

  // Always-current ref so syncFromDB() never reads a stale closure value.
  const valueRef = useRef(value);
  valueRef.current = value;

  const apiFetch = (method, body) => apiCall(apiPath, method, body);

  // ── Sync from DB when the user signs in (and local state is ready) ──────────
  useEffect(() => {
    if (user?.id && loaded) syncFromDB();
  }, [user?.id, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── syncFromDB — fires once on sign-in ──────────────────────────────────────
  const syncFromDB = async () => {
    try {
      const res = await apiFetch("GET");
      if (!res.ok) return;
      const dbValue = parse(await res.json());

      if (dbValue == null) {
        // No DB record yet — push current localStorage value up (first-time sync).
        pushLocal(valueRef.current, apiFetch); // fire-and-forget
        return;
      }

      // DB wins — commit and persist.
      const next = merge(dbValue, valueRef.current);
      setValue(next);
      persist(next);
    } catch {
      // Network error — stay on localStorage silently.
    }
  };

  // ── load — localStorage read (called once on mount by App.jsx) ──────────────
  const load = () => {
    const local = loadLocal();
    if (local !== undefined) setValue(local);
    setLoaded(true);
  };

  return { value, setValue, valueRef, loaded, load, user, apiFetch };
}
