// Synonym expansion for BM25 scoring — toggleable via settings.synonyms.
// Score-side only: original query goes to APIs unchanged.
// Synonyms widen what the scorer treats as a match.
//
// Sources:
//   1. Moby Thesaurus II (public domain, 30K roots, 2.5M synonyms)
//      Loaded on demand from /synonyms/{letter}.json shards.
//   2. Hand-curated academic clusters (inline, always available)
//      Covers domain-specific scientific terms Moby doesn't have.

// ── Academic clusters (instant, no fetch) ──────────────────────────

const ACADEMIC = [
  ["climate change", "global warming", "climate crisis"],
  ["machine learning", "deep learning", "neural network"],
  ["artificial intelligence", "AI", "machine intelligence"],
  ["COVID-19", "SARS-CoV-2", "coronavirus", "COVID"],
  ["DNA", "deoxyribonucleic acid"],
  ["RNA", "ribonucleic acid"],
  ["biodiversity", "biological diversity"],
  ["deforestation", "forest loss", "forest degradation"],
  ["renewable energy", "clean energy", "green energy"],
  ["genome", "genomics", "genomic"],
  ["proteome", "proteomics", "proteomic"],
  ["microbiome", "microbiota"],
  ["antibiotic resistance", "antimicrobial resistance", "AMR"],
  ["mental health", "psychological well-being", "psychological wellbeing"],
  ["water scarcity", "water stress", "water shortage"],
  ["food security", "food insecurity"],
];

const ACADEMIC_INDEX = new Map();
for (const cluster of ACADEMIC) {
  for (const term of cluster) {
    const key = term.toLowerCase();
    if (!ACADEMIC_INDEX.has(key)) ACADEMIC_INDEX.set(key, new Set());
    for (const syn of cluster) {
      if (syn.toLowerCase() !== key) ACADEMIC_INDEX.get(key).add(syn.toLowerCase());
    }
  }
}

// ── Moby Thesaurus shard loader ────────────────────────────────────

const shardCache = new Map();  // letter → Map<root, synonyms[]>
const MAX_MOBY_SYNS = 24;      // cap per root to keep scoring tight

async function loadShard(letter) {
  if (shardCache.has(letter)) return shardCache.get(letter);
  try {
    const resp = await fetch(`/synonyms/${letter}.json`);
    if (!resp.ok) throw new Error(resp.status);
    const data = await resp.json();
    const map = new Map(Object.entries(data));
    shardCache.set(letter, map);
    return map;
  } catch {
    shardCache.set(letter, new Map());
    return shardCache.get(letter);
  }
}

async function mobyLookup(term) {
  const t = term.toLowerCase();
  const first = t[0];
  if (!first || !/^[a-z]$/.test(first)) return [];
  const shard = await loadShard(first);
  const syns = shard.get(t);
  if (!syns) return [];
  return syns.slice(0, MAX_MOBY_SYNS);
}

// ── Public API ─────────────────────────────────────────────────────

export async function expandTerms(terms, enabled = false) {
  if (!enabled) return terms;

  const expanded = new Set(terms.map(t => t.toLowerCase()));

  // 1. Academic clusters (synchronous, always)
  for (const term of terms) {
    const syns = ACADEMIC_INDEX.get(term.toLowerCase());
    if (syns) for (const s of syns) expanded.add(s);
  }

  // 2. Moby Thesaurus (async shard fetch, cached after first load)
  const mobyResults = await Promise.all(terms.map(t => mobyLookup(t)));
  for (const syns of mobyResults) {
    for (const s of syns) expanded.add(s);
  }

  return [...expanded];
}
