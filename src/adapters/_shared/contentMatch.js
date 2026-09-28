// contentMatch.js — content-scope match predicate for adapters.
//
// v0.44 T5: relocated VERBATIM-in-behavior from src/lib/scoring.js (quarantined with the
// ranking engine this sprint). hasContentMatch is NOT ranking — it is the retrieval-
// correctness filter behind the v0.31 author-search-off contract: sources whose upstream
// query is author-inclusive (e.g. Crossref query.bibliographic) must drop results that
// match on author name alone when authorSearch is off. That contract survives the
// pass-through pipeline, so the predicate lives here in the adapter layer now.
// Sole consumer: src/adapters/core/crossref.js.

// Content fields considered (same set the old scorer used): title, abstract,
// keywords (+subjects folded into keywords).
const CONTENT_FIELDS = ["title", "abstract", "keywords"];

// Common English stopwords that carry no topical signal.
const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "by","from","as","is","are","was","were","be","been","being","have","has",
  "had","do","does","did","will","would","could","should","may","might",
  "shall","can","not","no","nor","so","yet","both","either","neither",
  "than","then","that","this","these","those","it","its","it's","i","we",
  "you","he","she","they","them","their","there","here","when","where",
  "which","who","whom","what","how","all","each","every","some","any",
  "few","more","most","other","into","through","during","before","after",
  "above","below","between","out","off","over","under","again","further",
  "once","about","up","down","such","s","t","re","ve","ll","d","m",
]);

function meaningfulTerms(terms) {
  return terms.map(t => t.toLowerCase()).filter(t => t.length > 1 && !STOPWORDS.has(t));
}

function tokenize(text) {
  return (text || "").toLowerCase().split(/\W+/).filter(Boolean);
}

function fieldText(result, field) {
  if (field === "keywords") return (result.keywords || []).concat(result.subjects || []).join(" ");
  return result[field] || "";
}

/**
 * hasContentMatch — does this result match the query in its CONTENT fields
 * (title/abstract/keywords+subjects)? A query with no meaningful terms never filters.
 * @param {Object} result
 * @param {string[]} terms  raw query terms (whitespace-split is fine)
 */
export function hasContentMatch(result, terms) {
  const words = meaningfulTerms(terms);
  if (!words.length) return true;
  const tokens = new Set();
  for (const f of CONTENT_FIELDS) {
    for (const w of tokenize(fieldText(result, f))) tokens.add(w);
  }
  return words.some(w => tokens.has(w));
}
