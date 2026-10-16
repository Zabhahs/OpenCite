# OpenCITE MCP server

Expose [OpenCITE](https://citation.today) to any MCP-compatible AI client as
three tools: **`search_scholarly_sources`**, **`search_citations`**, and
**`resolve_ids`**.

Every card names its **source database** and carries provenance (DOI, URL, journal,
authors) plus formatted citations. All tools require the same `OPENCITE_API_KEY`
and cost 1 credit per call, prorated by the coverage actually delivered.

Get a key: sign in at https://citation.today → **Developers** → Create key. Free accounts
receive 20 credits a month; packs start at $10 for 2,000 calls.

## Tools

### `search_scholarly_sources`

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `query` | string | yes | Search query. Separate multiple keywords with `;`. |
| `limit` | integer | no | Max merged results, 1–100 (default 25). |
| `format` | string | no | `json` (default, structured cards) · `mla` · `apa` · `bibtex` · `ris` · `csl-json`. |

Returns the JSON response envelope: `query`, `terms`, `coverage` band, `count`,
`totalCandidates`, `tookMs`, `meta` (`creditsCharged`, `balance`) and `results[]`
(cards with `source` and `citations`). Non-`json` formats return a flat bibliography string.

The input schema is generated from the API contract SSOT
(`api/_shared/apiContract.js`), so the tool never drifts from the REST endpoint.

### `search_citations`

Walk a paper's citation network in one call — no extra round-trips needed.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `id` | string | yes | DOI (e.g. `10.1038/nbt.3642`) or OpenAlex work ID (e.g. `W2741809809`). |
| `direction` | string | no | `cited-by` (default) — works citing this paper; `refs` — this paper's bibliography. |
| `limit` | integer | no | Max edges to return, 1–200 (default 25). |
| `minCitations` | integer | no | Cited-by only: drop citing works below this cited-by count. |
| `sort` | string | no | `impact` (default, by cited-by count) · `year` (newest first). |

Returns `{ id, direction, sort, count, tookMs, results[], meta }`.

### `resolve_ids`

Crosswalk scholarly identifiers (DOI ↔ PMID ↔ PMCID) in one batched call.
Accepts any mix, up to 200 IDs total.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `ids` | string[] | yes | Array of DOIs, PMIDs, and/or PMCIDs (any mix, max 200). |

Returns `{ count, requested, tookMs, results: { [inputId]: { doi, pmid, pmcid } }, meta }`.

## Install

```bash
npx -y opencite-mcp        # no install needed
# or, from a checkout:
cd mcp && npm install
```

## Configure (Claude Desktop)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "opencite": {
      "command": "npx",
      "args": ["-y", "opencite-mcp"],
      "env": {
        "OPENCITE_API_KEY": "oc_live_..."
      }
    }
  }
}
```

Other stdio MCP clients use the same `command`/`args`.

### Environment

| Var | Default | Notes |
|-----|---------|-------|
| `OPENCITE_API_KEY` | _(unset)_ | Forwarded as `x-api-key`. **Required** — every call is metered (1 credit). The key is **never logged**. |
| `OPENCITE_API_BASE_URL` | `https://citation.today` | Endpoint override. **TLS required** (https), except `localhost` for dev. |

## Schemas for other agent runtimes

The same contract also generates OpenAI/Anthropic function-tool definitions and
an OpenAPI 3.1 spec. Print them with:

```bash
npm run print-schemas
```

This emits `{ mcpTool, functionSchemas: { openai, anthropic }, openApi }` — drop
the relevant block into an OpenAI/Anthropic tool list or serve the OpenAPI doc.

## Boundary

This package calls `/api/search` over HTTP only — it does **not** import the
search pipeline. It is just an MCP-shaped client of the same public contract any
customer uses, so it automatically inherits the response contract and credit billing.
