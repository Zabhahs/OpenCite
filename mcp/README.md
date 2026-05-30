# OpenCITE MCP server

Expose [OpenCITE](https://citation.today) to any MCP-compatible AI client as a
single tool: **`search_scholarly_sources`**.

One call returns verifiable, deduped, ranked, citation-ready results across many
open-access scholarly sources. Results are **origin-blind** — every card carries
real provenance (DOI, URL, journal, authors, formatted citations) but never
discloses which upstream served it.

## Tool

### `search_scholarly_sources`

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `query` | string | yes | Search query. Separate multiple keywords with `;`. |
| `limit` | integer | no | Max merged results, 1–100 (default 25). |
| `format` | string | no | `json` (default, structured cards) · `mla` · `apa` · `bibtex` · `ris` · `csl-json`. |

Returns the JSON response envelope: `query`, `terms`, `coverage` band, `lowConfidence`,
`count`, `totalCandidates`, `tookMs`, and `results[]` (origin-blind cards with
`citations`). Non-`json` formats return a flat bibliography string.

The input schema is generated from the API contract SSOT
(`api/_shared/apiContract.js`), so the tool never drifts from the REST endpoint.

## Install

```bash
cd mcp
npm install
```

## Configure (Claude Desktop)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "opencite": {
      "command": "node",
      "args": ["/absolute/path/to/OpenCite/mcp/bin/opencite-mcp.js"],
      "env": {
        "OPENCITE_API_KEY": "your-key-if-you-have-one"
      }
    }
  }
}
```

Other stdio MCP clients use the same `command`/`args`.

### Environment

| Var | Default | Notes |
|-----|---------|-------|
| `OPENCITE_API_KEY` | _(unset)_ | Forwarded as `x-api-key`. Optional today (free tier is open); required once billing ships. The key is **never logged**. |
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
customer uses, so it automatically inherits the origin-blind response and
(forthcoming) credit billing.
