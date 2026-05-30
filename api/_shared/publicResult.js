// OpenCITE — origin-blind public card SSOT
// `toPublicResult` is the LAST transform in the API pipeline: it maps an internal
// normalized record to the public card. It deliberately DROPS `source` (origin) and
// replaces the upstream id with an opaque, deterministic `anonymizeId`.
//
// Origin-blindness invariant: scoring + dedup run on the internal record (which
// still carries `source`/`id`); only this final map strips them. Never reintroduce
// `source` here. Reused by any future export route so the contract stays in one place.
import { createHash } from "node:crypto";
import { buildMLA, buildAPA, segmentsToPlain, exportAs } from "../../src/lib/citations.js";

// Deterministic opaque id: stable across calls for the same work, reveals no upstream.
// Keyed on the strongest stable identity available (DOI → URL → title|year).
export function anonymizeId(r) {
  const basis = r.doi || r.url || `${r.title || ""}|${r.year || ""}`;
  const digest = createHash("sha1").update(basis).digest("base64");
  const b64url = digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `oc_${b64url.slice(0, 16)}`;
}

// Public, trimmed, origin-blind view: UnifiedResult fields (minus source) + opaque id
// + score + citations. citeFormats = extra formats beyond the always-present mla/apa.
export function toPublicResult(r, citeFormats = []) {
  const citations = {
    mla: segmentsToPlain(buildMLA(r)),
    apa: segmentsToPlain(buildAPA(r)),
  };
  for (const fmt of citeFormats) {
    citations[fmt] = fmt === "csl-json" ? JSON.parse(exportAs(r, fmt)) : exportAs(r, fmt);
  }
  return {
    id: anonymizeId(r),
    title: r.title,
    authors: r.authors,
    year: r.year,
    journal: r.journal,
    publisher: r.publisher,
    volume: r.volume,
    issue: r.issue,
    pages: r.pages,
    doi: r.doi,
    url: r.url,
    abstract: r.abstract,
    isOA: !!r.isOA,
    type: r.type,
    editors: r.editors,
    keywords: r.keywords,
    subjects: r.subjects,
    language: r.language,
    citedBy: r.citedBy ?? null,
    score: Number((r._score ?? 0).toFixed(4)),
    lowConfidence: !!r._lowConfidence,
    citations,
  };
}
