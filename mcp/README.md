# OpenCITE MCP server

Verifiable scholarly evidence for AI agents. Three tools:

| Tool | Use it when | Cost |
|------|-------------|------|
| **`verify_citations`** | **Before outputting any reference list.** Checks each reference (DOI, PMID, PMCID, DOI URL or a free-text citation) and returns a verdict — `verified` · `mismatch` (real id, wrong title/authors/year) · `not_found` (likely fabricated) · `ambiguous` — plus the canonical record, whether it is **retracted / corrected / under an expression of concern**, and a corrected citation. | 0.1 credit per reference |
| `search_papers` | You need real, citable sources on a topic. One deduplicated call across 250M+ open-access papers (OpenAlex, Crossref, DOAJ, PubMed) and museum, library, manuscript and Islamicate archives. | 1 credit, prorated by coverage |
| `get_paper` | You have an identifier and need the canonical record, every id (doi / pmid / pmcid / openalex), its integrity evidence, and optionally the works that cite it or its reference list. | 0.1 credit (record) · 1 credit (with graph) |

Every card names its **source database**, carries DOI/URL provenance and an `evidence` block
(`status`: `ok` · `retracted` · `corrected` · `expression_of_concern` · `unknown`, with notice DOIs
and dates from Crossref/Retraction Watch and OpenAlex). Every response says which sources
answered (`sources[]`) and carries a `meta.requestId`. Cards are compact by default; pass
`detail: "full"` for abstracts and all authors.

## Install

### Claude Code (one line)

```bash
claude mcp add opencite -e OPENCITE_API_KEY=oc_live_... -- npx -y opencite-mcp
```

### Claude Desktop and other stdio clients

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "opencite": {
      "command": "npx",
      "args": ["-y", "opencite-mcp"],
      "env": { "OPENCITE_API_KEY": "oc_live_..." }
    }
  }
}
```

Get a key: sign in at https://citation.today → **Developers** → *Create key*. Pay as you go is
$2.50 per 1,000 calls with 1,000 calls a month included (card at sign-up, billed monthly, you set
the cap); prepaid packs cost the same per call. `verify_citations` works **without a key** for up
to 25 references a day — the only tool that does.

### Environment

| Var | Default | Notes |
|-----|---------|-------|
| `OPENCITE_API_KEY` | _(unset)_ | Forwarded as `x-api-key`. **Required** — every call is metered. The key is **never logged**. |
| `OPENCITE_API_BASE_URL` | `https://citation.today` | Endpoint override. **TLS required** (https), except `localhost` for dev. |

## Tool arguments

### `verify_citations`

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `refs` | string[] | yes | Up to 50 references: DOIs, PMIDs, PMCIDs, DOI URLs, or free-text citation strings. |
| `style` | string | no | `apa` (default) · `mla` · `bibtex` · `ris` · `csl-json` — style of the corrected `citation`. |
| `detail` | string | no | `compact` (default) · `full`. |

Returns `{ count, summary: { verified, mismatch, not_found, ambiguous, retracted }, coverage, sources[], results[], meta }`.
Each result: `{ input, verdict, confidence, mismatched_fields[], record, evidence, citation, candidates[] }`.

### `search_papers`

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `query` | string | yes | Search query. Separate up to 5 keywords with `;`. |
| `limit` | integer | no | Max merged results, 1–100 (default 25). |
| `style` | string | no | Citation style on each card (default `apa`). |
| `detail` | string | no | `compact` (default) · `full`. |
| `evidence` | boolean | no | `false` skips the integrity lookup. |

Returns `{ query, terms, coverage, sources[], count, totalCandidates, tookMs, results[], meta }`.

### `get_paper`

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `id` | string | yes | DOI, DOI URL, PMID, PMCID or OpenAlex `W…` id. |
| `include` | string | no | `cited-by` (works citing it) · `refs` (its bibliography). |
| `limit` · `minCitations` · `sort` | | no | Graph controls (1–200 edges; `impact` or `year`). |
| `style` · `detail` | | no | As above. |

Returns `{ id, work, ids: { doi, pmid, pmcid, openalex }, graph, coverage, sources[], meta }`.

## Errors an agent will see

- **401** — missing/invalid key → `signup_url`.
- **402** — out of credits → `balance`, `upgrade_url`, `packs`. A human must top up.
- **429** — rate limited → `retry_after` seconds.

Every error is returned as an MCP error result with the action in plain text and the JSON body in `structuredContent`.

## Schemas for other agent runtimes

```bash
npm run print-schemas   # { tools, functionSchemas: { openai, anthropic }, openApi }
```

All schemas are generated from the API contract SSOT (`api/_shared/apiContract.js`, vendored
as `src/apiContract.js`; `npm run check-contract` fails if the copy is stale).

## Boundary

This package calls the public REST API over HTTPS only — it does **not** import the search
pipeline. It is an MCP-shaped client of the same contract any customer uses, so it inherits the
response contract and credit billing automatically.

## Changelog

- **0.48.0** — Contract v3. Three tools replace `search_scholarly_sources` / `search_citations` / `resolve_ids`: `verify_citations` (new), `search_papers`, `get_paper`. Cards carry `evidence`; responses carry `sources[]` and `meta.requestId`; compact cards by default; errors are actionable (402 carries `upgrade_url` + `packs`).
- 0.46.0 — Vendored contract; origin-transparent cards.
