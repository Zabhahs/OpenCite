// Synonym expansion for BM25 scoring — toggleable via settings.synonyms.
// Score-side only: original query goes to APIs unchanged.
// Synonyms widen what the scorer treats as a match.

const CLUSTERS = [
  ["climate change", "global warming", "climate crisis"],
  ["machine learning", "deep learning", "neural network"],
  ["artificial intelligence", "AI", "machine intelligence"],
  ["COVID-19", "SARS-CoV-2", "coronavirus", "COVID"],
  ["DNA", "deoxyribonucleic acid"],
  ["RNA", "ribonucleic acid"],
  ["behaviour", "behavior"],
  ["analyse", "analyze"],
  ["organisation", "organization"],
  ["colour", "color"],
  ["catalogue", "catalog"],
  ["defence", "defense"],
  ["honour", "honor"],
  ["labour", "labor"],
  ["tumour", "tumor"],
  ["oestrogen", "estrogen"],
  ["archaeology", "archeology"],
  ["palaeontology", "paleontology"],
  ["biodiversity", "biological diversity"],
  ["deforestation", "forest loss", "forest degradation"],
  ["renewable energy", "clean energy", "green energy"],
  ["genome", "genomics", "genomic"],
  ["proteome", "proteomics", "proteomic"],
  ["microbiome", "microbiota"],
  ["antibiotic resistance", "antimicrobial resistance", "AMR"],
  ["mental health", "psychological well-being", "psychological wellbeing"],
  ["inequality", "inequity", "disparity"],
  ["urbanization", "urbanisation"],
  ["water scarcity", "water stress", "water shortage"],
  ["food security", "food insecurity"],
];

const INDEX = new Map();
for (const cluster of CLUSTERS) {
  for (const term of cluster) {
    const key = term.toLowerCase();
    if (!INDEX.has(key)) INDEX.set(key, new Set());
    for (const syn of cluster) {
      if (syn.toLowerCase() !== key) INDEX.get(key).add(syn.toLowerCase());
    }
  }
}

export function expandTerms(terms, enabled = false) {
  if (!enabled) return terms;
  const expanded = new Set(terms.map(t => t.toLowerCase()));
  for (const term of terms) {
    const syns = INDEX.get(term.toLowerCase());
    if (syns) for (const s of syns) expanded.add(s);
  }
  return [...expanded];
}
