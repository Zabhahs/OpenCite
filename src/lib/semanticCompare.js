// OpenCITE — Semantic A/B runner (admin-only, v0.49)
//
// Runs ONE query through the browser retrieval pipeline twice — baseline (toggle off) and
// semantic (toggle on) — using exactly the same policy functions the live app uses
// (lib/semanticSearch.js) and the same adapters (adapters/index.js runSearch), then
// returns both ordered lists plus comparison numbers. Pure async function, no React, so
// the harness can loop it over any query list. Nothing is sent to our server: both arms
// call the sources from the browser like a normal search does.
//
// Fairness notes:
//   - Dedup runs in registry order (not arrival order) so a run is reproducible.
//   - Baseline order = round-robin interleave (what the unified view shows with the toggle off).
//   - Semantic order  = orderBySimilarity over the scored pool (what it shows with the toggle on).
//   - The semantic arm fetches OpenAlex 100-deep (policy R2), so its pool is larger. That is
//     the feature, not a confound: recall@N is measured against the same labels either way.

import { ADAPTERS, runSearch } from "../adapters/index.js";
import { doiKey, titleFingerprint, dedupFirstWins } from "./dedup.js";
import { queryForAdapter, optsForAdapter, interleaveLists, orderBySimilarity } from "./semanticSearch.js";
import { scoreResults } from "./semantic.js";
import { computeMetrics } from "./goldSetMetrics.js";

const resultKey = (r) => r.doi || r.title; // same identity the gold-set labels use

/** Retrieve + dedup for one arm. Returns { lists (per adapter, registry order), errors }. */
async function retrieve(query, adapters, settings) {
  const settled = await Promise.all(adapters.map(async (a) => {
    try {
      const { results } = await runSearch(a, queryForAdapter(a, query, settings), settings,
        optsForAdapter(a, settings, { offset: 0, pageToken: undefined }));
      return { id: a.id, results };
    } catch (err) {
      return { id: a.id, results: [], error: err?.message || String(err) };
    }
  }));
  const seenDois = new Set(), seenTitles = new Set();
  const lists = [], perAdapter = {}, errors = {};
  for (const s of settled) {
    const deduped = dedupFirstWins(dedupFirstWins(s.results, doiKey, seenDois), titleFingerprint, seenTitles);
    perAdapter[s.id] = deduped.length;
    if (s.error) errors[s.id] = s.error;
    lists.push(deduped);
  }
  return { lists, perAdapter, errors };
}

/**
 * compareQuery — run both arms for one query.
 * @param {string} query
 * @param {object} settings   the live settings object (semanticSearch is overridden per arm)
 * @param {Function} isEnabled adapter predicate from useSettings
 * @param {object} [labels]   gold-set labels { doi|title: grade } — metrics are computed when present
 * @param {Function} [onProgress] model download progress (first run only)
 */
export async function compareQuery(query, settings, isEnabled, labels, onProgress) {
  const adapters = ADAPTERS.filter(isEnabled);

  const t0 = Date.now();
  const base = await retrieve(query, adapters, { ...settings, semanticSearch: false });
  const baseline = interleaveLists(base.lists);
  const baseMs = Date.now() - t0;

  const t1 = Date.now();
  const sem = await retrieve(query, adapters, { ...settings, semanticSearch: true });
  const semFetchMs = Date.now() - t1;
  const pool = sem.lists.flat();
  const t2 = Date.now();
  const sims = await scoreResults(query, pool, { onProgress });
  const semantic = orderBySimilarity(pool.map((r, i) => ({ ...r, _sim: sims[i] })));
  const semRerankMs = Date.now() - t2;

  // Comparison numbers that need no labels.
  const top = (list, n) => list.slice(0, n).map(resultKey);
  const b10 = top(baseline, 10), s10 = new Set(top(semantic, 10));
  const overlap10 = b10.filter(k => s10.has(k)).length;
  const semRankOf = new Map(semantic.map((r, i) => [resultKey(r), i + 1]));
  const baselineTop5InSemantic = top(baseline, 5).map(k => semRankOf.get(k) ?? null);

  const hasLabels = labels && Object.keys(labels).length > 0;
  return {
    query,
    baseline: { results: baseline, perAdapter: base.perAdapter, errors: base.errors, ms: baseMs,
      metrics: hasLabels ? computeMetrics(baseline, labels) : null },
    semantic: { results: semantic, perAdapter: sem.perAdapter, errors: sem.errors,
      ms: semFetchMs + semRerankMs, fetchMs: semFetchMs, rerankMs: semRerankMs,
      metrics: hasLabels ? computeMetrics(semantic, labels) : null },
    overlap10,
    baselineTop5InSemantic,
    labeled: !!hasLabels,
  };
}

/** Strip result lists down to what the stored/exported run needs. */
export function compactRun(entry, keep = 10) {
  const slim = (r) => ({ key: resultKey(r), title: r.title, year: r.year, source: r.source, _sim: r._sim });
  return {
    ...entry,
    baseline: { ...entry.baseline, results: entry.baseline.results.slice(0, keep).map(slim) },
    semantic: { ...entry.semantic, results: entry.semantic.results.slice(0, keep).map(slim) },
  };
}
