---
machine_ids: [adapters.extensions.semanticScholar]
findings: [F-105]
runtime: both
status: quarantined
tags: [archive, quarantine, adapter, semanticscholar, s2]
---
<!-- AUTO-GENERATED from docs/wiki/99-Archive/_quarantine/adapter-semanticscholar.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# 🔒 Quarantined: Semantic Scholar (S2) adapter

> **Removed from build in v0.42.** Original path: `src/adapters/extensions/semanticScholar.js`.
> Already deregistered from the `ADAPTERS` array since v0.27; the orphan descriptor file and its
> `index.js` comment are now removed too. Full source below.

## Why removed (deprecated for good)
- **Deregistered v0.27** — never in the live `ADAPTERS` array; the file sat unused.
- **Approval-gated key** (`needsKey: true`, `keyName: "s2Key"`): the free S2 key requires manual
  approval that can take days — poor cost/benefit for a meta-search that prizes zero-friction use.
- **Heavily rate-limited** even with a key (HTTP 429) — unreliable.
- **F-105**: descriptor had `protocol: "graphql"` but the S2 Paper Search endpoint
  (`/graph/v1/paper/search`) is REST/JSON — stale/misleading metadata.

## Revival checklist (if ever resurrected)
- [ ] Confirm S2 API access model (key approval turnaround, rate limits) is acceptable.
- [ ] Fix `capability.protocol` → `"rest-json"` (it is NOT GraphQL).
- [ ] Re-add `export { SEMANTIC_SCHOLAR_ADAPTER } from "./semanticScholar.js";` to `extensions/index.js`,
      import + add to the `ADAPTERS` array in `index.js`, and re-add the `s2Key` settings field.
- [ ] Verify coverage/billing impact (keyed source auto-drops when `s2Key` absent).
- [ ] Flip the machine record `status` back to `degraded`/`healthy`.

## Verbatim source (as of v0.41)
```js
import { INITIAL_PAGE_SIZE, LOAD_MORE_PAGE_SIZE } from "../../constants/defaults.js";
import { ADAPTER_CATEGORY } from "../../constants/vocabulary.js";

// S2 publicationTypes → UnifiedResult type mapping
const S2_TYPE_MAP = {
  "JournalArticle": "journal-article",
  "Conference":     "proceedings-article",
  "Review":         "review-article",
  "CaseReport":     "article",
  "ClinicalTrial":  "article",
  "Dataset":        "dataset",
  "Editorial":      "article",
  "LettersAndComments": "article",
  "MetaAnalysis":   "review-article",
  "Study":          "article",
  "Book":           "book",
  "BookSection":    "book-chapter",
};

const inferS2Type = (publicationTypes) => {
  if (!Array.isArray(publicationTypes) || !publicationTypes.length) return "article";
  return S2_TYPE_MAP[publicationTypes[0]] || "article";
};

export const SEMANTIC_SCHOLAR_ADAPTER = {
  id: "S2",
  name: "Semantic Scholar",
  tagline: "AI-curated · cross-disciplinary · requires free API key",
  category: ADAPTER_CATEGORY.EXTENSION,
  region: ["global"],
  archiveType: ["scholarly-index"],
  contentType: ["peer-reviewed", "textual"],
  color: { bg: "bg-orange-800", text: "text-orange-50" },
  needsKey: true,
  keyName: "s2Key",
  keyLabel: "Semantic Scholar API key",
  keyHelp: "Free but requires approval (can take days). Request at semanticscholar.org/product/api.",
  // Deregistered v0.27 (not in ADAPTERS) — descriptor kept for completeness/future re-enable.
  capability: {
    protocol: "graphql", fulltext: false, pagination: "offset", totalCount: true, maxWindow: 1000, auth: "key",
    rankFields: { abstract: "full", subjects: "full", citedBy: true },
  },
  search: async (query, settings, opts = {}) => {
    if (!settings.s2Key) throw new Error("Semantic Scholar requires an API key. Add yours in settings (⚙) — it's free but takes a few days for approval.");
    const offset = opts.offset || 0;
    const limit = offset === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_PAGE_SIZE;
    const fields = "title,authors,year,venue,abstract,openAccessPdf,externalIds,journal,publicationTypes,citationCount,fieldsOfStudy";
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}&fields=${fields}`;
    const r = await fetch(url, { headers: { Accept: "application/json", "x-api-key": settings.s2Key } });
    if (!r.ok) {
      if (r.status === 429) throw new Error("Semantic Scholar rate-limited even with key. Try again in a moment.");
      if (r.status === 403) throw new Error("Semantic Scholar API key invalid or unauthorized. Verify in settings.");
      throw new Error(`Semantic Scholar ${r.status}`);
    }
    const data = await r.json();
    const results = (data.data || []).map((p, i) => {
      const doi = p.externalIds?.DOI || "";
      const oaUrl = p.openAccessPdf?.url || "";
      return {
        id: `s2-${p.paperId || `${offset}-${i}`}`,
        source: "S2",
        title: p.title || "Untitled",
        authors: (p.authors || []).map(a => a.name).filter(Boolean),
        year: p.year ? String(p.year) : "",
        journal: p.journal?.name || p.venue || "",
        publisher: "",
        volume: p.journal?.volume || "",
        issue: "",
        pages: p.journal?.pages || "",
        doi,
        url: oaUrl || (doi ? `https://doi.org/${doi}` : (p.paperId ? `https://www.semanticscholar.org/paper/${p.paperId}` : "")),
        abstract: p.abstract || "",
        isOA: !!oaUrl,
        type: inferS2Type(p.publicationTypes),
        // v.17 enrichment
        subjects: Array.isArray(p.fieldsOfStudy) ? p.fieldsOfStudy : [],
        citedBy: typeof p.citationCount === "number" ? p.citationCount : null,
      };
    });
    return { results, hasMore: offset + results.length < (data.total || 0) };
  }
};
```

## See also
[Quarantine register](../../01-Frontend/Components/_index.md) · [Extension-Adapters](../../02-Adapters/Extension-Adapters.md#semanticscholar-deregistered) · [Tech-Debt-Overengineering](../../09-Audit/Tech-Debt-Overengineering.md#f-105)
