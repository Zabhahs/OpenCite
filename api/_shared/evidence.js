// OpenCITE — evidence SSOT (v0.48, G4: integrity flags)
//
// Attaches an `evidence` block to result cards: retraction / correction / expression-of-concern
// status (with the notice DOI and date), work type, open-access status, DOAJ listing, curated
// index lists and the stated content licence. Facts with sources — never a judgement.
//
// Two upstreams, both batched by DOI and both verified live 2026-10-17 (sprint_log_v0_48 §2):
//   - Crossref  `/works?filter=doi:a,doi:b&select=DOI,updated-by,type` — the AUTHORITATIVE
//     retraction record: `updated-by[]` carries Retraction Watch + publisher notices with the
//     notice DOI, date and `source` (retraction-watch | publisher).
//   - OpenAlex  `/works?filter=doi:a|b&select=doi,is_retracted,type,open_access,primary_location`
//     — the fallback `is_retracted` flag (non-Crossref DOIs) plus OA status, DOAJ, index lists,
//     licence. Uses the project key (serverKeys.js) — a keyless call shares one $0.10/day budget.
//
// FAILURE-ISOLATED: this module never throws and never fails the parent call. A lookup outage
// leaves the affected cards at status "unknown" (always explicit, never omitted) and reports an
// EVIDENCE_* row in the response's `sources[]`. Evidence failures do NOT touch the coverage band
// — coverage is about the search sources, and the card itself was still delivered.
//
// Cached per DOI for 24h (cache.js / KV, fail-open). Retraction status changes rarely; the daily
// freshness is disclosed in the docs.

import { readCache, writeCache } from "./cache.js";
import { recordSuccess, recordFailure, isCircuitOpen } from "./adapterHealth.js";
import { EVIDENCE_STATUSES } from "./apiContract.js";

export const EVIDENCE_SOURCE_OPENALEX = "EVIDENCE_OPENALEX";
export const EVIDENCE_SOURCE_CROSSREF = "EVIDENCE_CROSSREF";

const OA_BASE = "https://api.openalex.org/works";
const CR_BASE = "https://api.crossref.org/works";
const OA_SELECT = "doi,is_retracted,type,open_access,primary_location";
const CR_SELECT = "DOI,updated-by,type";
// OpenAlex caps an OR-group at 25 ids (citationGraph.js:OA_BATCH); keep Crossref symmetric so a
// 100-result page is 4 + 4 calls, not 8 + 1 oversized URL.
const BATCH = 25;
const TIMEOUT_MS = 8000;
const CACHE_TTL = 24 * 60 * 60;
const cacheKeyFor = (doi) => `oc:evid:v1:${doi}`;

// Crossref `update-type` vocabulary → our three buckets. Both spellings of expression of concern
// exist in the live index (4,345 × `expression_of_concern`, 6 × `expression-of-concern`).
const RETRACTION_TYPES = new Set(["retraction", "partial_retraction", "withdrawal", "removal"]);
const CORRECTION_TYPES = new Set(["correction", "erratum", "corrigendum", "clarification", "addendum"]);
const normType = (t) => String(t || "").toLowerCase().replace(/-/g, "_");

export const EVIDENCE_UNKNOWN = "unknown";

// The canonical empty block. Every card without a DOI (or whose lookups all failed) carries this.
export function emptyEvidence() {
  return {
    status: EVIDENCE_UNKNOWN,
    retraction: null,
    corrections: [],
    expression_of_concern: null,
    work_type: null,
    oa_status: null,
    in_doaj: null,
    indexed_in: [],
    license: null,
    checked: [],
  };
}

const normDoi = (d) =>
  String(d || "").trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "");

const dateOf = (u) => {
  const parts = u?.updated?.["date-parts"]?.[0];
  if (!Array.isArray(parts) || !parts[0]) return null;
  const [y, m = 1, d = 1] = parts;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

const noticeOf = (u, fallbackSource) => ({
  notice_doi: u?.DOI ? normDoi(u.DOI) : null,
  date: dateOf(u),
  source: u?.source || fallbackSource || null,
});

// Fold a Crossref work record into the evidence block.
function applyCrossref(ev, item) {
  ev.checked.push("crossref");
  if (item.type && !ev.work_type) ev.work_type = item.type;
  for (const u of item["updated-by"] || []) {
    const t = normType(u.type);
    if (RETRACTION_TYPES.has(t)) {
      // Keep the EARLIEST retraction notice as the canonical one.
      const n = noticeOf(u, "publisher");
      if (!ev.retraction || (n.date && ev.retraction.date && n.date < ev.retraction.date)) ev.retraction = n;
    } else if (t === "expression_of_concern") {
      if (!ev.expression_of_concern) ev.expression_of_concern = noticeOf(u, "publisher");
    } else if (CORRECTION_TYPES.has(t)) {
      ev.corrections.push(noticeOf(u, "publisher"));
    }
  }
}

// Fold an OpenAlex work record into the evidence block.
function applyOpenAlex(ev, w) {
  ev.checked.push("openalex");
  // Crossref is authoritative for retractions (D-3); OpenAlex only fills the gap.
  if (w.is_retracted && !ev.retraction) ev.retraction = { notice_doi: null, date: null, source: "openalex" };
  if (w.type && !ev.work_type) ev.work_type = w.type;
  if (w.open_access?.oa_status) ev.oa_status = w.open_access.oa_status;
  const src = w.primary_location?.source;
  if (src && typeof src.is_in_doaj === "boolean") ev.in_doaj = src.is_in_doaj;
  if (Array.isArray(src?.listed_in)) ev.indexed_in = src.listed_in;
  if (w.primary_location?.license) ev.license = w.primary_location.license;
}

function finalizeStatus(ev) {
  if (ev.retraction) ev.status = "retracted";
  else if (ev.expression_of_concern) ev.status = "expression_of_concern";
  else if (ev.corrections.length) ev.status = "corrected";
  else ev.status = ev.checked.length ? "ok" : EVIDENCE_UNKNOWN;
  if (!EVIDENCE_STATUSES.includes(ev.status)) ev.status = EVIDENCE_UNKNOWN; // contract guard
  return ev;
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// One upstream, all batches. Returns { rows: Map<doi, raw>, status: "ok"|"failed"|"empty" }.
// A batch failure marks the source failed but keeps the other batches' rows (partial is fine —
// the untouched DOIs simply stay "unknown").
async function fetchBatches(cbId, dois, buildUrl, extract) {
  const rows = new Map();
  if (isCircuitOpen(cbId)) return { rows, status: "failed" };
  let failed = 0;
  const groups = [];
  for (let i = 0; i < dois.length; i += BATCH) groups.push(dois.slice(i, i + BATCH));
  const settled = await Promise.allSettled(groups.map((g) => fetchJson(buildUrl(g))));
  for (const s of settled) {
    if (s.status !== "fulfilled") { failed++; continue; }
    for (const [doi, raw] of extract(s.value)) rows.set(doi, raw);
  }
  failed === groups.length && groups.length ? recordFailure(cbId) : recordSuccess(cbId);
  const status = failed === groups.length ? "failed" : rows.size ? "ok" : "empty";
  return { rows, status };
}

/**
 * lookupEvidence(dois, opts) → { byDoi: Map<doi, evidence>, sources: [{ source, status, returned }] }
 * Pure lookup (cache → upstreams), keyed by normalized DOI. Never throws.
 */
export async function lookupEvidence(dois, { openAlexKey, mailto } = {}) {
  const byDoi = new Map();
  const sources = [];
  const unique = [...new Set((dois || []).map(normDoi).filter(Boolean))];
  if (!unique.length) return { byDoi, sources };

  // 1. Cache.
  const misses = [];
  await Promise.all(unique.map(async (doi) => {
    const hit = await readCache(cacheKeyFor(doi));
    if (hit) byDoi.set(doi, hit); else misses.push(doi);
  }));
  if (!misses.length) return { byDoi, sources };

  // 2. Upstreams in parallel.
  const contact = mailto || process.env.OPENCITE_MAILTO || "ops@citation.today";
  const oaAuth = openAlexKey ? `&api_key=${encodeURIComponent(openAlexKey)}` : `&mailto=${encodeURIComponent(contact)}`;
  const [cr, oa] = await Promise.all([
    fetchBatches(
      EVIDENCE_SOURCE_CROSSREF,
      misses,
      (g) => `${CR_BASE}?filter=${g.map((d) => `doi:${d}`).join(",")}&select=${CR_SELECT}&rows=${g.length}&mailto=${encodeURIComponent(contact)}`,
      (data) => (data?.message?.items || []).map((it) => [normDoi(it.DOI), it])
    ),
    fetchBatches(
      EVIDENCE_SOURCE_OPENALEX,
      misses,
      (g) => `${OA_BASE}?filter=doi:${g.join("|")}&select=${OA_SELECT}&per-page=${g.length}${oaAuth}`,
      (data) => (data?.results || []).map((w) => [normDoi(w.doi), w])
    ),
  ]);
  sources.push({ source: EVIDENCE_SOURCE_CROSSREF, status: cr.status, returned: cr.rows.size });
  sources.push({ source: EVIDENCE_SOURCE_OPENALEX, status: oa.status, returned: oa.rows.size });

  // 3. Merge per DOI; cache only blocks that at least one upstream actually answered for.
  await Promise.all(misses.map(async (doi) => {
    const ev = emptyEvidence();
    if (cr.rows.has(doi)) applyCrossref(ev, cr.rows.get(doi));
    if (oa.rows.has(doi)) applyOpenAlex(ev, oa.rows.get(doi));
    finalizeStatus(ev);
    byDoi.set(doi, ev);
    if (ev.checked.length) await writeCache(cacheKeyFor(doi), ev, CACHE_TTL);
  }));
  return { byDoi, sources };
}

/**
 * enrichEvidence(records, opts) → sources[]
 * Attaches `evidence` to every record in place (DOI-less records get the explicit unknown block)
 * and returns the EVIDENCE_* source rows for the response envelope. Never throws.
 */
export async function enrichEvidence(records, opts = {}) {
  try {
    const { byDoi, sources } = await lookupEvidence(records.map((r) => r.doi), opts);
    for (const r of records) r.evidence = byDoi.get(normDoi(r.doi)) || emptyEvidence();
    return sources;
  } catch {
    for (const r of records) if (!r.evidence) r.evidence = emptyEvidence();
    return [
      { source: EVIDENCE_SOURCE_CROSSREF, status: "failed", returned: 0 },
      { source: EVIDENCE_SOURCE_OPENALEX, status: "failed", returned: 0 },
    ];
  }
}
