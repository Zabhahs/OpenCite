// BM25F relevance scorer — SSOT for content relevance ranking.
// No author matching — content fields only (title, abstract, keywords).

const K1 = 1.2;
const B = 0.75;

const FIELD_WEIGHTS = { title: 3.0, abstract: 1.0, keywords: 2.0 };

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

export function scoreResults(results, terms) {
  if (!results.length || !terms.length) return results.map(r => ({ ...r, _score: 0 }));

  // Strip stopwords so "of", "the", etc. don't inflate scores on every document.
  const meaningful = meaningfulTerms(terms);
  // Fall back to all terms if every term is a stopword (e.g. query "the a an").
  const scoringTerms = meaningful.length ? meaningful : terms.map(t => t.toLowerCase());

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

    // Citation bonus is a small tiebreaker among relevant results, not a dominating signal.
    // Capped at +0.3 so a highly-cited irrelevant paper can't outrank a relevant one.
    const citedByBonus = score > 0 ? Math.min((r.citedBy || 0) / 5000, 0.3) : 0;
    return { ...r, _score: score + citedByBonus };
  });
}
