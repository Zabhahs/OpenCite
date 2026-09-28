// Synonyms Web Worker — fetches and parses Moby Thesaurus shards off the main thread.
// The 'c' shard is ~4MB; parsing it on the main thread caused a 50–150ms jank spike (F-207).
// Shards are cached in-worker after first load. The reply ships the shard as an entries
// array (Map isn't structured-clone-friendly as a live Map across all targets); the main
// thread rebuilds the Map.
const shardCache = new Map();

self.onmessage = async ({ data }) => {
  const { id, letter } = data;
  if (shardCache.has(letter)) {
    self.postMessage({ id, letter, entries: [...shardCache.get(letter).entries()] });
    return;
  }
  try {
    const resp = await fetch(`/synonyms/${letter}.json`);
    if (!resp.ok) throw new Error(resp.status);
    const raw = await resp.json(); // parse runs here, off the main thread
    const map = new Map(Object.entries(raw));
    shardCache.set(letter, map);
    self.postMessage({ id, letter, entries: [...map.entries()] });
  } catch {
    shardCache.set(letter, new Map());
    self.postMessage({ id, letter, entries: [] });
  }
};
