/**
 * Unit tests for idResolve.js — the pure, network-free surface: detectIdType, normalizeId,
 * and the token-bucket arithmetic (Appendix B.1). resolveIds/canonicalDoi hit the live NCBI
 * ID Converter and are verified against prod (sprint v0.43 T2.4), not here.
 *
 * Standalone Node runner (mirrors dedup.test.js): `node src/lib/idResolve.test.js`.
 */

import { pathToFileURL } from "node:url";
import { detectIdType, normalizeId, ncbiLimiter } from "./idResolve.js";

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ─── detectIdType ───

function test_detect_doi() {
  assert(detectIdType("10.1038/nature14539") === "doi", "bare DOI");
  assert(detectIdType("https://doi.org/10.1038/nature14539") === "doi", "DOI URL");
  assert(detectIdType("doi:10.1/x") === "doi", "doi: prefix");
}
function test_detect_pmid() {
  assert(detectIdType("23193287") === "pmid", "digits → pmid");
  assert(detectIdType(" 12345 ") === "pmid", "whitespace-trimmed digits → pmid");
}
function test_detect_pmcid() {
  assert(detectIdType("PMC3531190") === "pmcid", "PMC prefix → pmcid");
  assert(detectIdType("pmc3531190") === "pmcid", "lowercase pmc → pmcid");
  assert(detectIdType("PMC3531190.1") === "pmcid", "versioned PMCID → pmcid");
}

// ─── normalizeId ───

function test_normalize_strips_doi_prefixes() {
  assert(normalizeId("https://doi.org/10.1/x") === "10.1/x", "https doi.org stripped");
  assert(normalizeId("http://dx.doi.org/10.1/x") === "10.1/x", "dx.doi.org stripped");
  assert(normalizeId("doi: 10.1/x") === "10.1/x", "doi: prefix stripped");
  assert(normalizeId("  PMC123  ") === "PMC123", "non-DOI just trimmed");
}

// ─── Token bucket: shared key returns the same bucket; first caller wins the rate ───

function test_limiter_shared_instance() {
  const a = ncbiLimiter(3, "test_shared");
  const b = ncbiLimiter(10, "test_shared"); // same key → same bucket, original rate kept
  assert(a === b, "same limiter key must return the same bucket instance");
  assert(a.rate === 3, `first caller's rate must win, got ${a.rate}`);
}

async function test_limiter_throttles_when_drained() {
  // A 1000 req/s bucket starts with 1000 tokens; drain them then confirm the next acquire
  // blocks (a non-zero wait). Uses a high rate so the test stays fast (~1ms wait).
  const lim = ncbiLimiter(1000, "test_drain");
  lim.tokens = 0; lim.last = performance.now();
  const t0 = performance.now();
  await lim.acquire(); // tokens<1 → must sleep ~1ms
  assert(performance.now() - t0 >= 0.5, "acquire on a drained bucket must wait");
}

// ─── Runner ───

const tests = [
  test_detect_doi,
  test_detect_pmid,
  test_detect_pmcid,
  test_normalize_strips_doi_prefixes,
  test_limiter_shared_instance,
  test_limiter_throttles_when_drained,
];

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log("Running idResolve tests...\n");
  let passed = 0, failed = 0;
  for (const test of tests) {
    try { await test(); console.log(`✓ ${test.name}`); passed++; }
    catch (e) { console.log(`✗ ${test.name}: ${e.message}`); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
