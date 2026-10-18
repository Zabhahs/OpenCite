// OpenCITE — browser search-capture client (sprint v0.50)
//
// The browser fans out to the adapters itself, so /api/search never sees a web search. This module
// is the ONE place the SPA talks to /api/telemetry (api/_shared/handlers/telemetry.js):
//   sendSearchEvent  — the ordered page the user actually saw (fires from hooks/useSearchTelemetry)
//   emitSignal       — click / open / copy / save / expand on a result (fires from ResultCard)
//   startResultDwell — timer around an outbound click; emits a `dwell` signal when the tab regains focus
//   flushPageDwell   — time on the results page, written to the event on next search / pagehide
//
// Everything is fire-and-forget and swallows errors: telemetry must never break a search. Records
// are trimmed to the fields the server needs to upsert a `works` row (title · authors · year ·
// venue · doi · url · abstract · keywords · type · isOA · citedBy) — never the UI card.
// `settings.telemetry === false` (defaults.js) turns the whole module off.

import { apiCall } from "./api.js";

// Mirrors api/_shared/searchLog.js SIGNAL (web subset). Keep in sync.
export const SIGNAL = Object.freeze({
  click_title: 0,
  open_link: 1,
  copy_cite: 2,
  save_library: 3,
  expand_cite: 4,
  dwell: 5,
});

const ENDPOINT = "/api/telemetry";
const MAX_ABSTRACT = 3000;

const state = {
  enabled: true,
  eventId: null,        // current search_events.id (from the last sendSearchEvent)
  rankOf: new Map(),    // adapter record id → displayed rank for the current page
  readyAt: 0,           // when the current results page became visible
  pendingDwell: null,   // { record, rank, t0 } after an outbound click
  listeners: false,
};

export const setTelemetryEnabled = (v) => { state.enabled = v !== false; };
export const currentEventId = () => state.eventId;

// Minimal `works` basis for one record (anonymizeId needs doi | url | title+year).
export function trimRecord(r) {
  if (!r) return null;
  return {
    id: r.id ?? null,
    source: r.source ?? null,
    title: r.title ?? null,
    authors: Array.isArray(r.authors) ? r.authors.slice(0, 25) : [],
    year: r.year ?? null,
    journal: r.journal ?? null,
    publisher: r.publisher ?? null,
    doi: r.doi ?? null,
    url: r.url ?? null,
    abstract: typeof r.abstract === "string" ? r.abstract.slice(0, MAX_ABSTRACT) : null,
    keywords: Array.isArray(r.keywords) ? r.keywords.slice(0, 15) : [],
    type: r.type ?? null,
    isOA: r.isOA ?? null,
    citedBy: r.citedBy ?? null,
    ...(typeof r._sim === "number" ? { _sim: r._sim } : {}),
  };
}

function post(body, { keepalive = true } = {}) {
  try {
    return fetch(ENDPOINT, {
      method: "POST",
      credentials: "include",
      keepalive,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch { return Promise.resolve(null); }
}

// sendBeacon survives page unload where fetch-keepalive may not; used only on pagehide.
function beacon(body) {
  try {
    if (navigator.sendBeacon) return navigator.sendBeacon(ENDPOINT, new Blob([JSON.stringify(body)], { type: "application/json" }));
  } catch {}
  post(body);
}

/**
 * sendSearchEvent({ query, executedQuery, settings, eligible, failed, records, page, tookMs })
 *   records — the FULL ordered page as displayed (hooks/useSearchTelemetry computes the order).
 * Resolves to the eventId (or null). Resets the rank map and the page-dwell clock.
 */
export async function sendSearchEvent({ query, executedQuery, settings, eligible, failed, records, page = 0, tookMs = null }) {
  if (!state.enabled || !query) return null;
  state.rankOf = new Map(records.map((r, i) => [r.id, i]));
  state.readyAt = Date.now();
  state.pendingDwell = null;
  try {
    const res = await post({
      kind: "search", query, executedQuery, settings, eligible, failed, page, tookMs,
      records: records.map(trimRecord),
    }, { keepalive: false });
    const data = res && res.ok ? await res.json() : null;
    state.eventId = data?.eventId ?? null;
  } catch { state.eventId = null; }
  return state.eventId;
}

// A user action on one result. `result` is the UI record (editions already stripped by the caller).
export function emitSignal(result, action, meta = null) {
  if (!state.enabled || !result || state.eventId == null) return;
  const rank = state.rankOf.get(result.id) ?? -1;
  post({ kind: "signal", eventId: state.eventId, record: trimRecord(result), rank, action, meta });
}

// Outbound click: start the result-dwell clock. Stops when the tab is visible/focused again
// (the standard SERP dwell proxy — a quick bounce back reads as a poor result).
export function startResultDwell(result) {
  if (!state.enabled || !result || state.eventId == null) return;
  installListeners();
  state.pendingDwell = { record: result, t0: Date.now() };
}

function settleResultDwell() {
  const p = state.pendingDwell;
  if (!p) return;
  state.pendingDwell = null;
  const ms = Date.now() - p.t0;
  if (ms < 300) return; // the new tab never took focus — not a dwell
  emitSignal(p.record, SIGNAL.dwell, { ms });
}

// Time on the results page. Called on the next search / reset (fetch) and on pagehide (beacon).
export function flushPageDwell(reason = "next") {
  if (!state.enabled || state.eventId == null || !state.readyAt) return;
  const body = { kind: "dwell", eventId: state.eventId, ms: Date.now() - state.readyAt };
  state.readyAt = 0;
  if (reason === "pagehide") beacon(body); else post(body);
}

function installListeners() {
  if (state.listeners || typeof window === "undefined") return;
  state.listeners = true;
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") settleResultDwell(); });
  window.addEventListener("focus", settleResultDwell);
  window.addEventListener("pagehide", () => {
    // The result tab is still open: count what we have so far, then the page dwell.
    if (state.pendingDwell) settleResultDwell();
    flushPageDwell("pagehide");
  });
}

// Shared with the hook so pagehide is covered even before the first outbound click.
export const ensureTelemetryListeners = installListeners;

// Unused import guard — apiCall is the SPA's cookie-including fetch; telemetry uses raw fetch for
// `keepalive`, which apiCall does not expose. Kept as the reference implementation of the headers.
void apiCall;
