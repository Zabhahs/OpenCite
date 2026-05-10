// OpenCITE — useLibrary
// Auth-aware: signed-in users sync to DB via /api/library (fire-and-forget writes).
// Anonymous users fall through to localStorage via lib/library.js — unchanged behaviour.

import { useState } from "react";
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

  // ── load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    if (user) {
      const res = await apiFetch("GET");
      if (res.ok) {
        const rows = await res.json();   // [{ ...result, savedAt }]
        setItems(rows);
        return;
      }
    }
    setItems(library.load());
  };

  // ── isInLibrary ───────────────────────────────────────────────────────────
  const isInLibrary = (result) =>
    items.some(item => libraryKey(item) === libraryKey(result));

  // ── toggle ────────────────────────────────────────────────────────────────
  const toggle = (result) => {
    if (isInLibrary(result)) {
      const next = library.remove(result);   // always sync localStorage
      setItems(next);
      if (user) apiFetch("DELETE", { library_key: libraryKey(result) }); // non-blocking
    } else {
      const next = library.add(result);      // always sync localStorage
      setItems(next);
      if (user) apiFetch("POST", { result }); // non-blocking
    }
  };

  // ── exportBibliography — unchanged ────────────────────────────────────────
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
      ...items.flatMap(item => [segmentsToPlain(buildAPA(item)), ""])
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
