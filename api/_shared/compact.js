// OpenCITE — card projection SSOT (v0.48, contract v3)
//
// `renderCard` is the ONE entry point every endpoint uses to turn an internal record into a
// public card. It composes (never re-implements) the existing card builders:
//   - compact (default): the agent-sized card — agents pay for context, so a search answer is
//     ~60% smaller than the v2 card: title, ≤3 authors + "et al.", year, venue, doi, url, type,
//     citedBy, the evidence block, and ONE formatted citation in the requested style.
//   - full: the v2 card from publicResult.js (+ evidence), or the admin origin-revealing variant.
//
// Field names are the contract's (apiContract.js COMPACT_FIELDS); nothing here invents one.

import { toPublicResult } from "./publicResult.js";
import { toDebugResult } from "./debugResult.js";
import { exportAs } from "../../src/lib/citations.js";
import { DEFAULT_STYLE, DEFAULT_DETAIL, CITATION_STYLES, DETAIL_LEVELS, CITE_FORMATS } from "./apiContract.js";

const MAX_COMPACT_AUTHORS = 3;
const first = (v) => (Array.isArray(v) ? v[0] : v) ?? "";
const isFalsy = (v) => v === "0" || v === "false" || v === "no";

// Parse the card-shaping params shared by every endpoint (search, works, verify) from a query
// (or a JSON body) — ONE validator so `detail=` / `style=` / `evidence=` / `cite=` can't drift.
export function cardOptsFrom(src = {}) {
  const detail = String(first(src.detail)).trim().toLowerCase();
  const style = String(first(src.style)).trim().toLowerCase();
  const citeFormats = String(first(src.cite)).split(",").map((s) => s.trim().toLowerCase()).filter((s) => CITE_FORMATS.includes(s));
  return {
    detail: DETAIL_LEVELS.includes(detail) ? detail : DEFAULT_DETAIL,
    style: CITATION_STYLES.includes(style) ? style : DEFAULT_STYLE,
    evidence: !isFalsy(String(first(src.evidence)).trim().toLowerCase()),
    citeFormats,
  };
}

// One citation in one style — string for text styles, an object for csl-json.
export function citationIn(r, style = DEFAULT_STYLE) {
  return style === "csl-json" ? JSON.parse(exportAs(r, "csl-json")) : exportAs(r, style);
}

export function toCompactResult(r, { style = DEFAULT_STYLE } = {}) {
  // Reuse the public builder for the opaque id + normalized fields (DRY); project from it.
  const full = toPublicResult(r, []);
  const authors = (full.authors || []).slice(0, MAX_COMPACT_AUTHORS);
  if ((full.authors || []).length > MAX_COMPACT_AUTHORS) authors.push("et al.");
  const card = {
    id: full.id,
    source: full.source,
    doi: full.doi || null,
    title: full.title,
    authors,
    year: full.year || null,
    venue: full.journal || null,
    url: full.url || null,
    type: full.type || null,
    citedBy: full.citedBy ?? null,
  };
  if (r.evidence) card.evidence = r.evidence;
  card.citation = citationIn(r, style);
  return card;
}

/**
 * renderCard(record, opts) — the single card renderer.
 *   detail      "compact" (default) | "full"
 *   style       citation style for the compact card
 *   citeFormats extra formats on the full card (mla + apa always present)
 *   debug       admin-only origin-revealing full card (caller has verified identity.admin)
 */
export function renderCard(r, { detail = DEFAULT_DETAIL, style = DEFAULT_STYLE, citeFormats = [], debug = false } = {}) {
  if (detail !== "full") return toCompactResult(r, { style });
  const full = debug ? toDebugResult(r, citeFormats) : toPublicResult(r, citeFormats);
  if (r.evidence) full.evidence = r.evidence;
  return full;
}
