// Result identity & de-duplication — SSOT for collapsing the same work across sources.
//
// Two arrival models need different merge rules:
//   - Streaming (per-adapter, each batch scored in isolation): first occurrence wins,
//     since later sources haven't arrived yet and scores aren't comparable across batches.
//   - Pooled (every source scored together): keep the highest-scored copy per key.

// DOI is the strongest identity signal when present; null = no DOI, never dedup on it.
export const doiKey = (r) => r.doi || null;

// Same-paper fingerprint for records registered under multiple DOIs — e.g. a JSTOR DOI
// and a publisher DOI for the same Crossref article. Null when there's no title to key on.
export const titleFingerprint = (r) => {
  const t = (r.title || "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const surname = (r.authors?.[0] || "").split(" ").pop().toLowerCase();
  return `${t}|${r.year || ""}|${surname}`;
};

// Streaming first-wins dedup. Drops records whose key was already seen; mutates `seen`
// so it persists across successive adapter batches / load-more pages. Null key = always kept.
export function dedupFirstWins(records, keyFn, seen) {
  return records.filter((r) => {
    const key = keyFn(r);
    if (key == null) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Pooled dedup keeping the highest-scored copy per key. Null key = always kept.
export function dedupHighestScore(records, keyFn) {
  const byKey = new Map();
  const out = [];
  for (const r of records) {
    const key = keyFn(r);
    if (key == null) { out.push(r); continue; }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, r);
      out.push(r);
    } else if ((r._score || 0) > (existing._score || 0)) {
      byKey.set(key, r);
      out[out.indexOf(existing)] = r;
    }
  }
  return out;
}
