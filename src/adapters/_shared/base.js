/**
 * AbstractAdapter
 *
 * Base class for all OpenCITE source adapters. Provides:
 *   - Shared shape enforcement via the static sanitize() guard
 *   - Future billing/rate-limit hook point in the registry wrapper
 *
 * Adapters do NOT extend this class directly — they export plain objects
 * matching the adapter shape. The registry calls AbstractAdapter.sanitize()
 * on every result before it reaches the UI.
 *
 * When Phase 2 (rate limiting) ships, the registry's runSearch() wrapper
 * will call BillingContext.deduct() here — adapter files stay untouched.
 */
export class AbstractAdapter {
  /**
   * sanitize() — DataMappingGuard.
   * Prevents runtime errors from .trim() on null/undefined upstream fields.
   * Enforces the UnifiedResult contract on every result from every adapter.
   * Called by the registry after every search(), not by individual adapters.
   */
  static sanitize(result) {
    const str = (v) => (v == null ? "" : String(v).trim());
    const arr = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
    const num = (v) => (typeof v === "number" && !isNaN(v) ? v : null);
    return {
      ...result,
      title:     str(result.title) || "Untitled",
      authors:   arr(result.authors),
      year:      str(result.year),
      journal:   str(result.journal),
      publisher: str(result.publisher),
      volume:    str(result.volume),
      issue:     str(result.issue),
      pages:     str(result.pages),
      doi:       str(result.doi),
      url:       str(result.url),
      abstract:  str(result.abstract),
      type:      str(result.type) || "article",
      // v.17 — optional enrichment fields (adapters may omit any of these)
      editors:   arr(result.editors),
      keywords:  arr(result.keywords),
      subjects:  arr(result.subjects),
      language:  str(result.language),
      citedBy:   num(result.citedBy),
      // v.35 — native upstream relevance signal (D3). nativeScore: the source's own
      // full-corpus relevance number (OpenAlex relevance_score, Crossref Solr score);
      // null when the API exposes none. nativeRank: 0-based position in the source's
      // native relevance order — the universal fallback prior (every relevance-ordered
      // source has it). The ranker FUSES nativeRank (scale-free) with local BM25F via RRF.
      nativeScore: num(result.nativeScore),
      nativeRank:  num(result.nativeRank),
    };
  }
}

/**
 * UnifiedResult shape — all fields optional except title.
 * @typedef {Object} UnifiedResult
 * @property {string}   id
 * @property {string}   source
 * @property {string}   title
 * @property {string[]} authors
 * @property {string}   year
 * @property {string}   journal
 * @property {string}   publisher
 * @property {string}   volume
 * @property {string}   issue
 * @property {string}   pages
 * @property {string}   doi
 * @property {string}   url
 * @property {string}   abstract
 * @property {boolean}  isOA
 * @property {string}   type
 * @property {string}   [previewImage]
 * @property {string[]} [editors]     — v.17: book/collection editors
 * @property {string[]} [keywords]    — v.17: author-assigned keywords
 * @property {string[]} [subjects]    — v.17: controlled vocabulary terms
 * @property {string}   [language]    — v.17: ISO 639 language code
 * @property {number}   [citedBy]     — v.17: citation count (relevance signal)
 * @property {number}   [nativeScore] — v.35: source's own full-corpus relevance number
 *           (OpenAlex relevance_score, Crossref Solr score); null when none exposed
 * @property {number}   [nativeRank]  — v.35: 0-based position in the source's native
 *           relevance order; the RRF fusion's scale-free relevance prior
 */

/**
 * AdapterCapability — machine-readable descriptor of how an adapter talks to its
 * upstream API and what rank-relevant fields it emits. SSOT read by the ranker,
 * registry, and UI instead of hard-coded per-adapter logic.
 *
 * rankFields values are CODE-VERIFIED against what each adapter actually emits
 * today (not what the API could return) — they describe current reality so the
 * scorer can reason about field-poor sources without per-file special-casing.
 *
 * @typedef {Object} AdapterCapability
 * @property {("rest-json"|"sru"|"sparql"|"oai-pmh"|"graphql"|"elasticsearch"|"blacklight"|"mediawiki")} protocol
 * @property {boolean} fulltext     — searches content body (OCR/full text), not just metadata
 * @property {("page"|"offset"|"cursor"|"token"|"none")} pagination
 * @property {boolean} totalCount   — upstream returns a real total-result count
 * @property {?number} maxWindow    — deep-paging cap (offset+rows ceiling), or null if unbounded/unknown
 * @property {("none"|"key"|"polite")} auth
 * @property {AdapterRankFields} rankFields
 * @property {boolean} [serverSafe] — true when the adapter runs cleanly inside the
 *           public /api/search Node function (keyless + direct fetch or runtime-aware
 *           proxiedFetch, no DOMParser). Drives the derived server-safe adapter set;
 *           defaults to false (unset = not server-safe).
 * @property {number} [corpusSize] — order-of-magnitude searchable record count for the
 *           upstream; the corpus weight coverage.js uses for corpus-weighted attrition.
 *           Conservative when unknown (under-state, never inflate).
 *
 * @typedef {Object} AdapterRankFields
 * @property {("full"|"sparse"|"none")} abstract — "full": dedicated description field;
 *           "sparse": constructed/label text or short one-liner; "none": never emitted
 * @property {("full"|"sparse"|"none")} subjects — keyword/subject signal richness
 *           (merged with keywords under one BM25F weight); "sparse" = non-topical labels
 * @property {boolean} citedBy — emits a numeric citedBy value (note: IA emits download counts)
 * @property {("score"|"rank"|"none")} [nativeRelevance] — v.35: trust level of the source's
 *           native ordering. "score": emits a real full-corpus relevance number into
 *           nativeScore (OpenAlex, Crossref); "rank": returns results in relevance order so
 *           position (nativeRank) is a valid prior (DOAJ, IA); "none"/absent: order is not a
 *           relevance signal — excluded from native-rank fusion (gets BM25F/semantic only).
 */
