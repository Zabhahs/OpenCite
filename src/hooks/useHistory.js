// OpenCITE — useHistory
// Auth-aware: signed-in users sync to DB via /api/history (fire-and-forget writes).
// Anonymous users fall through to localStorage via lib/history.js — unchanged behaviour.

import { useState } from "react";
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

  // ── load ──────────────────────────────────────────────────────────────────
  // Called once on mount by the component that renders history.
  const load = async () => {
    if (user) {
      const res = await apiFetch("GET");
      if (res.ok) {
        const rows = await res.json();
        setEntries(rows);          // [{ query, ts }] — same shape as localStorage
        return;
      }
      // DB fetch failed — fall through to localStorage silently
    }
    setEntries(history.load());
  };

  // ── add ───────────────────────────────────────────────────────────────────
  // Write is fire-and-forget for signed-in users — UI updates immediately.
  const add = (query) => {
    const next = history.add(query);   // always write localStorage (offline resilience)
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
