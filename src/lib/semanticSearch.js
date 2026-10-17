// OpenCITE — semantic-search policy (SSOT)
//
// v0.49: the "Semantic search" toggle changes HOW we retrieve and HOW we order, and every
// consumer (useSearch, the unified list, the admin A/B harness) reads the policy from here so
// the browser pipeline and the test harness can never drift apart.
//
// Three rules when the toggle is on:
//   R1  Keyword rewrite — every source EXCEPT OpenAlex gets the query with filler words
//       removed. OpenAlex's title_and_abstract.search handles sentences natively (stemming +
//       stopwords server-side); Crossref's query.bibliographic and the heritage keyword boxes
//       do not, and a raw sentence there surfaces personal-name monographs (v0.46 lane note).
//   R2  Deep page — OpenAlex is asked for DEEP_PAGE_SIZE results on the first page instead of
//       INITIAL_PAGE_SIZE. It is the only source that reliably returns abstracts, so it is the
//       only one worth going deep on; the reranker can only reorder what was fetched.
//   R3  Order by meaning — results carry `_sim` (cosine similarity to the query, set by
//       lib/semantic.js) and are ordered by it, highest first. Results that could not be
//       scored keep their native order after the scored ones.
//
// Nothing here touches the network or the model; it is pure policy + pure ordering.

import { STOPWORDS } from "../adapters/_shared/contentMatch.js";

export const DEEP_SOURCE_ID = "OPENALEX";
export const DEEP_PAGE_SIZE = 100;

export const isSemanticOn = (settings) => !!settings?.semanticSearch;

/**
 * toKeywordQuery — strip stopwords and punctuation noise from a natural-language query.
 * "how does sleep loss affect teenagers' working memory" → "sleep loss affect teenagers working memory".
 * Falls back to the original query when nothing meaningful survives (e.g. a one-word query
 * that happens to be a stopword), so a source is never sent an empty string.
 */
export function toKeywordQuery(query) {
  const q = String(query || "").trim();
  const kept = q
    .split(/\s+/)
    .map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")) // trim punctuation, keep hyphens/apostrophes inside
    .filter(w => w.length > 1 && !STOPWORDS.has(w.toLowerCase()));
  return kept.length ? kept.join(" ") : q;
}

/** R1 — the query string a given adapter should receive. */
export function queryForAdapter(adapter, query, settings) {
  if (!isSemanticOn(settings) || adapter.id === DEEP_SOURCE_ID) return query;
  return toKeywordQuery(query);
}

/** R2 — the run options a given adapter should receive (deep first page for OpenAlex). */
export function optsForAdapter(adapter, settings, opts = {}) {
  if (!isSemanticOn(settings) || adapter.id !== DEEP_SOURCE_ID) return opts;
  if ((opts.offset || 0) !== 0) return opts; // load-more pages stay small
  return { ...opts, pageSize: DEEP_PAGE_SIZE };
}

/** Round-robin interleave: result #1 of each list, then #2, … (v0.44 D-3 default order). */
export function interleaveLists(lists) {
  const out = [];
  const maxLen = lists.reduce((m, l) => Math.max(m, l.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}

/** True when at least one result has been scored by the semantic reranker. */
export const hasSemanticOrder = (results) => results.some(r => typeof r._sim === "number");

/** R3 — order a flat pool by `_sim` desc; unscored results follow in their original order. */
export function orderBySimilarity(results) {
  const scored = [], unscored = [];
  results.forEach((r, i) => (typeof r._sim === "number" ? scored : unscored).push([r, i]));
  scored.sort((a, b) => (b[0]._sim - a[0]._sim) || (a[1] - b[1])); // stable on ties
  return [...scored.map(p => p[0]), ...unscored.map(p => p[0])];
}
