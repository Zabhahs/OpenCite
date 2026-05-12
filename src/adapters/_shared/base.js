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
 */
