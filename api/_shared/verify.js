// OpenCITE — citation verification SSOT (v0.48, G1: existence — the anti-hallucination path)
//
// For each reference an agent is about to cite — a DOI, PMID, PMCID, DOI URL, or a free-text
// citation string — decide whether a real work matches it, and how well:
//   verified   the identifier resolves (and any supplied text agrees), or a free-text reference
//              matches one real work with high confidence
//   mismatch   the closest REAL work differs from what was supplied (the classic hallucination:
//              a real DOI attached to the wrong title/authors/year, or a title that exists under
//              other authors). `mismatched_fields` names what disagrees; `record` is the real work.
//   not_found  nothing above the candidate floor — most likely fabricated
//   ambiguous  two or more real works match about equally; the top candidates are returned
//
// Resolution order: identifier → canonical record (OpenAlex via citationGraph.getWork, then
// Crossref /works/{doi}); free text → Crossref `query.bibliographic` top-3 (OpenAlex `search=`
// when Crossref fails). Scoring compares each candidate's title/first-author/year/venue against
// the WHOLE input string (token containment), so no fragile reference-parser is needed. All
// thresholds live in THRESHOLDS; prefer `ambiguous` over a wrong `verified`.
//
// Leg health (sprint v0.45 T5) is tallied into opts.health so a total upstream outage bills 0.

import { detectIdType, normalizeId, resolveIds } from "../../src/lib/idResolve.js";
import { surnameOf } from "../../src/lib/dedup.js";
import { parseCrossrefItem } from "../../src/adapters/_shared/parseCrossref.js";
import { parseOpenAlexWork, OA_SELECT } from "../../src/adapters/_shared/parseOpenAlex.js";
import { getWork } from "./citationGraph.js";
import { enrichEvidence } from "./evidence.js";
import { recordSuccess, recordFailure, isCircuitOpen } from "./adapterHealth.js";

const CR_BASE = "https://api.crossref.org/works";
const OA_BASE = "https://api.openalex.org/works";
const CB_CR = "VERIFY_CROSSREF";
const CB_OA = "VERIFY_OPENALEX";
const TIMEOUT_MS = 8000;
const CANDIDATES = 3;
const CONCURRENCY = 8; // refs resolved in parallel — well inside the Crossref polite-pool rate

// SSOT scoring constants. Weighted containment of the candidate's fields in the input text.
export const THRESHOLDS = {
  weights: { title: 0.6, author: 0.2, year: 0.15, venue: 0.05 },
  verified: 0.8,   // best ≥ this → verified (unless a close second → ambiguous)
  floor: 0.45,     // best < this → not_found
  margin: 0.08,    // best − second < this (both ≥ verified) → ambiguous
  titleMismatch: 0.5, // id refs with text: title containment below this → "title" mismatched
};

const STOP = new Set(["a", "an", "the", "of", "in", "on", "and", "or", "for", "to", "with", "by", "at", "from", "as", "is", "are", "its", "into", "et", "al", "de", "la", "le", "der", "die", "das", "und", "du", "des"]);
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tokens = (s) => fold(s).replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t && t.length > 1 && !STOP.has(t));

// Fraction of the candidate field's tokens that appear in the input token set, with the hit
// count so callers can demand a minimum. Smoke-tested 2026-10-17: a 3-token title ("Does China
// Exist?") matched 2 of 3 tokens of a fabricated reference and scored as a plausible mismatch —
// hence MIN_TITLE_HITS below (a title counts only when ≥3 tokens match, or all of a shorter one).
function containment(fieldText, inputSet) {
  const toks = tokens(fieldText);
  if (!toks.length) return { ratio: 0, hits: 0, total: 0 };
  let hits = 0;
  for (const t of toks) if (inputSet.has(t)) hits++;
  return { ratio: hits / toks.length, hits, total: toks.length };
}
const MIN_TITLE_HITS = 3;

const DOI_IN_TEXT = /\b(10\.\d{4,9}\/[^\s"'<>),;]+)/i;
const YEAR_IN_TEXT = /\b(19|20)\d{2}\b/g;

// Does the input look like a bare identifier (DOI / PMID / PMCID / DOI URL) with no prose?
function bareId(input) {
  const s = normalizeId(input);
  if (/^pmc\d+$/i.test(s) || /^\d{4,9}$/.test(s)) return s;
  if (/^10\.\d{4,9}\/\S+$/.test(s) && !/\s/.test(s)) return s;
  return null;
}

// Score a candidate card against the input string. Returns { score, fields } where fields lists
// which of title/author/year/venue agreed (true) or not (false) or were untestable (null).
function scoreCandidate(card, input) {
  const set = new Set(tokens(input));
  const w = THRESHOLDS.weights;
  const t = containment(card.title, set);
  // A title "matches" only on ≥ MIN_TITLE_HITS shared tokens (or every token of a shorter title).
  const title = t.hits >= MIN_TITLE_HITS || (t.total > 0 && t.hits === t.total) ? t.ratio : 0;
  const surname = surnameOf(card.authors?.[0]);
  const author = surname ? set.has(fold(surname).replace(/[^a-z0-9]/g, "")) : null;
  const years = [...String(input).matchAll(YEAR_IN_TEXT)].map((m) => Number(m[0]));
  const cy = Number(card.year);
  const year = years.length && cy ? years.some((y) => Math.abs(y - cy) <= 1) : null;
  const venue = card.journal ? containment(card.journal, set).ratio : null;
  // Re-normalize weights over the testable fields so an input with no year isn't penalized.
  let num = w.title * title, den = w.title;
  if (author !== null) { num += w.author * (author ? 1 : 0); den += w.author; }
  if (year !== null) { num += w.year * (year ? 1 : 0); den += w.year; }
  if (venue !== null) { num += w.venue * venue; den += w.venue; }
  // `fields` are tri-state booleans: true agrees, false disagrees, null untestable.
  return {
    score: den ? num / den : 0,
    fields: { title: title >= THRESHOLDS.titleMismatch, author, year, venue: venue === null ? null : venue >= 0.5 },
  };
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

const bump = (h, k) => { if (h) h[k] = (h[k] || 0) + 1; };

// Crossref lookup by DOI → card | null (404 = unknown, a sold answer; other errors = failed leg).
async function crossrefByDoi(doi, { mailto, health }) {
  bump(health, "attempted");
  if (isCircuitOpen(CB_CR)) { bump(health, "failed"); return null; }
  const path = encodeURIComponent(doi).replace(/%2F/gi, "/");
  try {
    const data = await fetchJson(`${CR_BASE}/${path}?mailto=${encodeURIComponent(mailto)}`);
    recordSuccess(CB_CR);
    return data?.message ? parseCrossrefItem(data.message, 0) : null;
  } catch (err) {
    if (/^404$/.test(err?.message || "")) { recordSuccess(CB_CR); return null; }
    recordFailure(CB_CR);
    bump(health, "failed");
    return null;
  }
}

// Free-text candidates: Crossref bibliographic query, OpenAlex search as the fallback.
async function candidatesFor(text, { mailto, openAlexKey, health }) {
  bump(health, "attempted");
  if (!isCircuitOpen(CB_CR)) {
    try {
      const data = await fetchJson(`${CR_BASE}?query.bibliographic=${encodeURIComponent(text)}&rows=${CANDIDATES}&mailto=${encodeURIComponent(mailto)}`);
      recordSuccess(CB_CR);
      const items = data?.message?.items || [];
      if (items.length) return items.map((it, i) => parseCrossrefItem(it, `v-${i}`));
    } catch {
      recordFailure(CB_CR);
      bump(health, "failed");
    }
  } else {
    bump(health, "failed");
  }
  // Fallback leg.
  bump(health, "attempted");
  if (isCircuitOpen(CB_OA)) { bump(health, "failed"); return []; }
  const auth = openAlexKey ? `&api_key=${encodeURIComponent(openAlexKey)}` : `&mailto=${encodeURIComponent(mailto)}`;
  try {
    const data = await fetchJson(`${OA_BASE}?search=${encodeURIComponent(text)}&per-page=${CANDIDATES}&select=${OA_SELECT}${auth}`);
    recordSuccess(CB_OA);
    return (data?.results || []).map((w, i) => parseOpenAlexWork(w, `v-${i}`));
  } catch {
    recordFailure(CB_OA);
    bump(health, "failed");
    return [];
  }
}

// Resolve one reference (no evidence yet). Returns the per-ref result sans `evidence`/`citation`.
async function verifyOne(input, ctx) {
  const text = String(input || "").trim();
  const base = { input: text, verdict: "not_found", confidence: 0, mismatched_fields: [], record: null, candidates: [] };
  if (!text) return base;

  // 1. Identifier path — bare id, or an id embedded in prose (then the prose is also checked).
  const bare = bareId(text);
  const embedded = bare ? null : DOI_IN_TEXT.exec(text)?.[1];
  const idStr = bare || embedded;
  if (idStr) {
    let doi = null;
    const type = detectIdType(idStr);
    if (type === "doi") doi = normalizeId(idStr);
    else {
      const map = await resolveIds([idStr], { apiKey: ctx.ncbiApiKey, email: ctx.mailto, health: ctx.health });
      doi = map.get(idStr)?.doi || null;
      if (!doi) return { ...base, verdict: "not_found" };
    }
    let record = (await getWork(doi, { mailto: ctx.mailto, health: ctx.health }))?.card || null;
    if (!record) record = await crossrefByDoi(doi, ctx);
    if (!record) return { ...base, verdict: "not_found" };
    if (bare) return { ...base, verdict: "verified", confidence: 1, record };
    // Id + prose: the id is real; does the prose describe THIS work?
    const { score, fields } = scoreCandidate(record, text);
    const bad = Object.entries(fields).filter(([, ok]) => ok === false).map(([k]) => k);
    const verdict = fields.title === false || (bad.length >= 2) ? "mismatch" : "verified";
    return { ...base, verdict, confidence: Math.round(score * 100) / 100, mismatched_fields: verdict === "mismatch" ? bad : [], record };
  }

  // 2. Free-text path.
  const cands = await candidatesFor(text, ctx);
  if (!cands.length) return base;
  const scored = cands.map((c) => ({ c, ...scoreCandidate(c, text) })).sort((a, b) => b.score - a.score);
  const best = scored[0], second = scored[1];
  const conf = Math.round(best.score * 100) / 100;
  const topCards = scored.slice(0, CANDIDATES).map((s) => s.c);
  if (best.score >= THRESHOLDS.verified) {
    if (second && second.score >= THRESHOLDS.verified && best.score - second.score < THRESHOLDS.margin) {
      return { ...base, verdict: "ambiguous", confidence: conf, record: best.c, candidates: topCards };
    }
    return { ...base, verdict: "verified", confidence: conf, record: best.c };
  }
  // A free-text "mismatch" means the TITLE is real but author/year/venue disagree (e.g. the same
  // title republished by other authors). Without a title match, author + year + venue alone
  // identify nothing — that is a fabricated reference, not a near-miss (smoke-tested 2026-10-17).
  if (best.score >= THRESHOLDS.floor && best.fields.title) {
    const bad = Object.entries(best.fields).filter(([, ok]) => ok === false).map(([k]) => k);
    return { ...base, verdict: "mismatch", confidence: conf, mismatched_fields: bad, record: best.c, candidates: topCards };
  }
  return { ...base, verdict: "not_found", confidence: conf, candidates: topCards };
}

/**
 * verifyReferences(refs, opts) → { results[], summary }
 *   opts: { mailto, openAlexKey, ncbiApiKey, health, evidence:boolean }
 * `results[i].record` / `candidates[]` are INTERNAL records (render with compact.renderCard).
 * Evidence is attached to every matched record in one batched lookup; its source rows are
 * returned as `evidenceSources` for the envelope.
 */
export async function verifyReferences(refs, opts = {}) {
  const ctx = {
    mailto: opts.mailto || process.env.OPENCITE_MAILTO || "ops@citation.today",
    openAlexKey: opts.openAlexKey,
    ncbiApiKey: opts.ncbiApiKey,
    health: opts.health,
  };
  const results = new Array(refs.length);
  for (let i = 0; i < refs.length; i += CONCURRENCY) {
    const slice = refs.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(slice.map((r) => verifyOne(r, ctx).catch(() => null)));
    settled.forEach((v, j) => { results[i + j] = v || { input: String(refs[i + j] || ""), verdict: "not_found", confidence: 0, mismatched_fields: [], record: null, candidates: [] }; });
  }

  let evidenceSources = [];
  if (opts.evidence !== false) {
    const records = results.flatMap((r) => [r.record, ...(r.candidates || [])]).filter(Boolean);
    evidenceSources = await enrichEvidence(records, { openAlexKey: ctx.openAlexKey, mailto: ctx.mailto });
  }

  const summary = { verified: 0, mismatch: 0, not_found: 0, ambiguous: 0, retracted: 0 };
  for (const r of results) {
    summary[r.verdict] = (summary[r.verdict] || 0) + 1;
    if (r.record?.evidence?.status === "retracted") summary.retracted++;
  }
  return { results, summary, evidenceSources };
}
