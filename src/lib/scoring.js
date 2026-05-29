// BM25F relevance scorer — SSOT for content relevance ranking.
// No author matching — content fields only (title, abstract, keywords).

const K1 = 1.2;
const B = 0.75;

const FIELD_WEIGHTS = { title: 3.0, abstract: 1.0, keywords: 2.0 };

// v.26 Phase B — phrase & proximity boosts.
// PHRASE_BOOST: per-field multiplier when a multi-word query phrase appears verbatim.
// PROX_BOOST:   per-field max bonus when distinct query words sit close together.
// PROX_WINDOW:  token gap (between two query words) beyond which proximity scores nothing.
const PHRASE_BOOST = 2.0;
const PROX_BOOST = 1.0;
const PROX_WINDOW = 6;

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

export function meaningfulTerms(terms) {
  return terms.map(t => t.toLowerCase()).filter(t => t.length > 1 && !STOPWORDS.has(t));
}

function tokenize(text) {
  return (text || "").toLowerCase().split(/\W+/).filter(Boolean);
}

function fieldText(result, field) {
  if (field === "keywords") return (result.keywords || []).concat(result.subjects || []).join(" ");
  return result[field] || "";
}

function termFreq(term, tokens) {
  const t = term.toLowerCase();
  let count = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === t) count++;
  }
  return count;
}

function idf(term, docsFieldTokens) {
  const N = docsFieldTokens.length;
  let df = 0;
  const t = term.toLowerCase();
  for (let i = 0; i < N; i++) {
    const doc = docsFieldTokens[i];
    for (const field in doc) {
      if (termFreq(t, doc[field]) > 0) { df++; break; }
    }
  }
  return Math.log(1 + (N - df + 0.5) / (df + 0.5));
}

// Split raw query terms into single scoring words.
// A user term like "machine learning" arrives as one array element; BM25F
// operates on single tokens, so we tokenize each term into its component words.
// Stopwords are stripped; we fall back to all words if every word is a stopword.
function scoringWords(terms) {
  const words = [];
  for (const t of terms) for (const w of tokenize(t)) words.push(w);
  const meaningful = meaningfulTerms(words);
  const chosen = meaningful.length ? meaningful : words.map(w => w.toLowerCase());
  return [...new Set(chosen)];
}

// Multi-word phrases from the raw query terms, for verbatim phrase matching.
// Single-word terms produce no phrase (nothing to keep contiguous).
function queryPhrases(terms) {
  return terms
    .map(t => tokenize(t))
    .filter(ws => ws.length > 1)
    .map(ws => ws.join(" "));
}

// Phrase bonus: fires once per field when the query phrase appears verbatim
// (as a contiguous token run) in that field. Scaled by field weight.
function phraseBonus(phrases, docTokens, fields) {
  if (!phrases.length) return 0;
  let bonus = 0;
  for (const f of fields) {
    const hay = " " + docTokens[f].join(" ") + " ";
    for (const p of phrases) {
      if (hay.includes(" " + p + " ")) bonus += FIELD_WEIGHTS[f] * PHRASE_BOOST;
    }
  }
  return bonus;
}

// Proximity bonus: rewards documents where distinct query words sit close
// together in the same field, even when not a verbatim phrase. Uses the
// smallest gap between any two distinct query words; closer = larger bonus,
// decaying linearly to zero at PROX_WINDOW.
function proximityBonus(words, docTokens, fields) {
  if (words.length < 2) return 0;
  const wordSet = new Set(words);
  let bonus = 0;
  for (const f of fields) {
    const tokens = docTokens[f];
    // Collect positions of each query word present in this field.
    const positions = [];
    for (let i = 0; i < tokens.length; i++) {
      if (wordSet.has(tokens[i])) positions.push([i, tokens[i]]);
    }
    if (positions.length < 2) continue;
    // Find the smallest gap between two *distinct* query words.
    let minGap = Infinity;
    for (let i = 1; i < positions.length; i++) {
      const [pi, wi] = positions[i];
      const [pj, wj] = positions[i - 1];
      if (wi !== wj) minGap = Math.min(minGap, pi - pj);
    }
    if (minGap === Infinity || minGap > PROX_WINDOW) continue;
    bonus += FIELD_WEIGHTS[f] * PROX_BOOST * (1 - (minGap - 1) / PROX_WINDOW);
  }
  return bonus;
}

export function scoreResults(results, terms) {
  if (!results.length || !terms.length) return results.map(r => ({ ...r, _score: 0 }));

  // Word-level scoring terms (multi-word terms split into words, stopwords stripped).
  const scoringTerms = scoringWords(terms);
  // Verbatim phrases (multi-word terms) for the phrase boost.
  const phrases = queryPhrases(terms);

  const fields = Object.keys(FIELD_WEIGHTS);

  const docsTokens = results.map(r => {
    const out = {};
    for (const f of fields) out[f] = tokenize(fieldText(r, f));
    return out;
  });

  const avgLens = {};
  for (const f of fields) {
    let total = 0;
    for (let i = 0; i < docsTokens.length; i++) total += docsTokens[i][f].length;
    avgLens[f] = total / docsTokens.length || 1;
  }

  const idfs = {};
  for (const t of scoringTerms) idfs[t] = idf(t, docsTokens);

  return results.map((r, idx) => {
    let score = 0;
    const docTokens = docsTokens[idx];

    for (const t of scoringTerms) {
      let weightedTf = 0;
      for (const f of fields) {
        const tokens = docTokens[f];
        const tf = termFreq(t, tokens);
        if (tf === 0) continue;
        const len = tokens.length;
        const norm = 1 - B + B * (len / avgLens[f]);
        weightedTf += FIELD_WEIGHTS[f] * (tf / norm);
      }
      score += idfs[t] * (weightedTf * (K1 + 1)) / (weightedTf + K1);
    }

    // Phrase & proximity boosts only meaningfully fire on multi-word queries.
    // They reward documents that match the query as a unit, not just bag-of-words.
    if (score > 0) {
      score += phraseBonus(phrases, docTokens, fields);
      score += proximityBonus(scoringTerms, docTokens, fields);
    }

    // Citation bonus is a small tiebreaker among relevant results, not a dominating signal.
    // Capped at +0.3 so a highly-cited irrelevant paper can't outrank a relevant one.
    const citedByBonus = score > 0 ? Math.min((r.citedBy || 0) / 5000, 0.3) : 0;
    return { ...r, _score: score + citedByBonus };
  });
}
