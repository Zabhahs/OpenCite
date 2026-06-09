// OpenCITE — identifier resolution (DOI ↔ PMID ↔ PMCID), isomorphic.
//
// Approach adapted (clean-room) from neuromechanist/opencite (MIT): clients/id_converter.py
// + clients/base.py. We re-implement the BEHAVIOUR in JS — no code copied (§6, sprint v0.43).
//
// Wraps the NCBI PMC ID Converter (current host; the legacy www.ncbi.nlm.nih.gov/pmc/utils
// path is deprecated). Two consumers:
//   1. a pre-dedup canonicalizer — resolve a PMID/PMCID-only record to its DOI so it shares a
//      doiKey with the DOI-only copy from another source (attacks the v0.35 D5 fragmentation
//      defect; feeds the v0.42 F-208 / F-210 dedup field-merge).
//   2. the /api/ids endpoint + MCP `resolve_ids` tool — user/model-facing conversion.
//
// Isomorphic: no Node-only imports. `performance.now()` is global in Node ≥16 and browsers;
// `fetch` is global in Node ≥18 and browsers. The NCBI key (10 req/s vs 3 req/s keyless) is
// passed in by the caller (server reads process.env.NCBI_API_KEY; the browser has none).

// PMC ID Converter — current host (verified live 2026-06-09; legacy path 301s here).
const IDCONV_BASE = "https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/";
// The API rejects mixed-type batches and caps a request at 200 homogeneous ids (Appendix B.2).
const MAX_BATCH = 200;
// Shared rate-limit budget for ALL NCBI E-utilities/idconv traffic in this process. A PubMed
// adapter can call `ncbiLimiter()` with the same key so the two never blow the combined
// per-host budget (the one genuinely smart pattern in their base.py). Process-local only:
// on Vercel it limits per warm instance, not globally (same caveat as adapterHealth.js) —
// true cross-instance coordination would need external KV.
const LIMITER_KEY = "ncbi_eutils";
const RATE_KEYLESS = 3;   // req/s, hard-enforced by NCBI
const RATE_KEYED = 10;    // req/s with a free NCBI API key
const DEFAULT_EMAIL = "ops@citation.today"; // courtesy contact; NCBI asks for tool+email

// ── Token-bucket limiter (Appendix B.1 — port the arithmetic faithfully; easy to get wrong) ──
// One bucket per limiter key, kept in module scope and reused regardless of the caller's own
// rate params (first caller wins the rate), so all NCBI traffic shares one budget.
const _buckets = new Map(); // key → { tokens, rate, burst, last }

class TokenBucket {
  constructor(rate) {
    this.rate = rate;
    this.burst = rate;       // allow a full second's worth of burst
    this.tokens = rate;      // start full (float)
    this.last = performance.now();
  }
  async acquire() {
    // Refill: add the tokens accrued since the last check, capped at burst.
    const now = performance.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) {
      const waitMs = ((1 - this.tokens) / this.rate) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
      // CRITICAL: after sleeping, zero the bucket and RE-READ the clock — reusing the
      // pre-sleep timestamp would double-count the slept interval on the next refill.
      this.tokens = 0;
      this.last = performance.now();
    } else {
      this.tokens -= 1;
    }
  }
}

// Get (or lazily create) the shared NCBI limiter. Exported so a PubMed adapter can share it.
export function ncbiLimiter(rate = RATE_KEYLESS, key = LIMITER_KEY) {
  let b = _buckets.get(key);
  if (!b) { b = new TokenBucket(rate); _buckets.set(key, b); }
  return b;
}

// ── ID type detection ─────────────────────────────────────────────────────────────────────
// Order matters: a DOI starts with "10.", a PMCID with "PMC", and a bare PMID is digits-only.
// Tighter than the source's naive port: DOI is anchored on `^10\.`, the PMC prefix is
// normalized, and a versioned PMCID (PMC123.4) still types as pmcid.
const PMCID_RE = /^pmc\d+(\.\d+)?$/i;
const PMID_RE = /^\d+$/;
const DOI_RE = /^10\.\d{4,9}\//;

// Strip a DOI URL/`doi:` prefix down to the bare DOI; leave PMID/PMCID untouched.
export function normalizeId(id) {
  const s = String(id || "").trim();
  return s.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
}

export function detectIdType(id) {
  const s = normalizeId(id);
  if (PMCID_RE.test(s)) return "pmcid";
  if (PMID_RE.test(s)) return "pmid";
  if (DOI_RE.test(s)) return "doi";
  // Fallback: anything else with a slash is treated as a DOI (the source's else-branch).
  return s.includes("/") ? "doi" : "pmid";
}

// Chunk an array into ≤size homogeneous slices.
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// One idconv request for a homogeneous group. Returns the raw records array (or [] on failure).
// 429 comes back as a JSON BODY (not just an HTTP status) — parse it defensively and treat the
// whole batch as unresolved rather than throwing the caller's whole resolution.
async function convertChunk(ids, idtype, { email, apiKey, signal } = {}) {
  const limiter = ncbiLimiter(apiKey ? RATE_KEYED : RATE_KEYLESS);
  await limiter.acquire();

  const params = new URLSearchParams({
    ids: ids.join(","),
    idtype,
    format: "json",
    versions: "no",          // collapse versioned PMCIDs to the current version
    tool: "opencite",
    email: email || DEFAULT_EMAIL,
  });
  if (apiKey) params.set("api_key", apiKey);

  let body;
  try {
    const res = await fetch(`${IDCONV_BASE}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal,
    });
    body = await res.json().catch(() => null);
  } catch {
    return [];
  }
  // Request-level error (incl. 429 returned as a JSON body) → no records from this batch.
  if (!body || body.status === "error") return [];
  return Array.isArray(body.records) ? body.records : [];
}

// ── Public API ──────────────────────────────────────────────────────────────────────────────

/**
 * resolveIds(ids, opts) → Map<inputId, { doi, pmid, pmcid }>
 *
 * Splits the inputs into homogeneous type groups (the API rejects mixed batches), chunks each
 * group ≤200, and resolves them in parallel. Per-record `status:"error"` entries are skipped.
 * The map is keyed by the original input id (the API echoes it as `requested-id`). Inputs that
 * fail to resolve simply have no map entry.
 *
 * @param {string[]} ids
 * @param {{email?:string, apiKey?:string, signal?:AbortSignal}} [opts]
 */
export async function resolveIds(ids, opts = {}) {
  const out = new Map();
  const list = (ids || []).map((x) => String(x).trim()).filter(Boolean);
  if (!list.length) return out;

  // Group by detected type so each request is homogeneous with an explicit idtype.
  const groups = { doi: [], pmid: [], pmcid: [] };
  for (const id of list) groups[detectIdType(id)].push(id);

  const jobs = [];
  for (const [idtype, groupIds] of Object.entries(groups)) {
    if (!groupIds.length) continue;
    for (const slice of chunk(groupIds, MAX_BATCH)) {
      jobs.push(
        convertChunk(slice.map(normalizeId), idtype, opts).then((records) => {
          for (const rec of records) {
            if (!rec || rec.status === "error") continue; // skip per-record failures
            // Map back to the original (un-normalized) input via requested-id when possible.
            const requested = rec["requested-id"];
            const key = slice.find((s) => normalizeId(s) === requested) ?? requested ?? slice[0];
            out.set(key, {
              doi: rec.doi || null,
              pmid: rec.pmid || null,
              pmcid: rec.pmcid || null,
            });
          }
        })
      );
    }
  }
  await Promise.all(jobs);
  return out;
}

/**
 * canonicalDoi(record, opts) → Promise<string|null>
 *
 * The record's own DOI when present; otherwise resolve it from the record's PMID/PMCID via the
 * ID Converter. Used by the pre-dedup canonicalizer to give a PMID/PMCID-only record the same
 * doiKey as its DOI-only duplicate. Returns null when no DOI can be obtained.
 *
 * @param {{doi?:string, pmid?:string, pmcid?:string}} record
 */
export async function canonicalDoi(record, opts = {}) {
  if (record?.doi) return normalizeId(record.doi);
  const seed = record?.pmcid || record?.pmid;
  if (!seed) return null;
  const map = await resolveIds([seed], opts);
  return map.get(String(seed).trim())?.doi || null;
}
