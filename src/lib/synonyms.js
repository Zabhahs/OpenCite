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

// ── Off-thread shard loader (F-207) ────────────────────────────────
// Moby shards (esp. 'c', ~4MB) are fetched + JSON-parsed inside a Web Worker so the parse
// never janks the main thread. Mirrors the embed-worker pattern in src/lib/semantic.js.
// Falls back to a synchronous main-thread fetch in environments without Worker (SSR/tests).
let synWorker = null;
let synMsgId = 0;
const synPending = new Map();

function getSynWorker() {
  if (synWorker) return synWorker;
  synWorker = new Worker(new URL("../workers/synonyms.worker.js", import.meta.url), { type: "module" });
  synWorker.onmessage = ({ data }) => {
    const p = synPending.get(data.id);
    if (!p) return;
    const map = new Map(data.entries);
    shardCache.set(data.letter, map);
    p.resolve(map);
    synPending.delete(data.id);
  };
  return synWorker;
}

async function loadShard(letter) {
  if (shardCache.has(letter)) return shardCache.get(letter);

  // Fallback: no Worker (SSR/test) → original inline fetch + parse.
  if (typeof Worker === "undefined") {
    try {
      const resp = await fetch(`/synonyms/${letter}.json`);
      if (!resp.ok) throw new Error(resp.status);
      const map = new Map(Object.entries(await resp.json()));
      shardCache.set(letter, map);
      return map;
    } catch {
      shardCache.set(letter, new Map());
      return shardCache.get(letter);
    }
  }

  return new Promise((resolve) => {
    const id = ++synMsgId;
    synPending.set(id, { resolve });
    getSynWorker().postMessage({ id, letter });
  });
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
