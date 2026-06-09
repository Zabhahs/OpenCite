---
machine_ids: [mcp.server, mcp.client, mcp.contract, mcp.schema, mcp.bin]
findings: [F-500, F-501]
runtime: server
status: healthy
tags: [mcp, api-client, schema-gen, acquisition]
---
<!-- AUTO-GENERATED from docs/wiki/06-MCP-Server/MCP-Server.md by scripts/wiki/to-github.mjs — do not edit here. Edit the Obsidian source in docs/wiki/ and re-run: node scripts/wiki/to-github.mjs -->


# MCP Server

> `mcp/` is a standalone Node.js package that wraps the public `/api/search` HTTP endpoint as an MCP tool (`search_scholarly_sources`), letting any MCP-compatible AI client (Claude Desktop, OpenAI, Gemini) drive OpenCITE searches.

## What it is

The MCP server lives under `mcp/` and is a **pure HTTP client** of the same `/api/search` endpoint every external caller uses. It does not import the search pipeline (`src/`), does not connect to Prisma/Supabase, and does not hold any adapter logic. It is designed so that any bug fixes or billing changes in `api/search.js` are automatically inherited without touching MCP code.

The package exposes one tool — `search_scholarly_sources` — with three agent-facing parameters (`query`, `limit`, `format`). All schema definitions are **generated from the API contract SSOT** (`api/_shared/apiContract.js`), ensuring the MCP surface never drifts from the REST endpoint. This reuse is the DRY-4 pattern.

The package also generates OpenAI and Anthropic function-tool definitions and an OpenAPI 3.1 spec via `node src/schema.js` (or `npm run print-schemas`). These are the drop-in integration artifacts for v0.37's acquisition funnel.

## Files

| File | ID | Purpose |
|---|---|---|
| `mcp/bin/opencite-mcp.js` | `mcp.bin` | Shebang entrypoint — calls `startStdioServer()` and exits 1 on failure |
| `mcp/src/server.js` | `mcp.server` | Creates the MCP `Server` object; registers `ListTools` and `CallTool` handlers |
| `mcp/src/client.js` | `mcp.client` | REST client — calls `/api/search` over HTTPS; enforces TLS; 30s timeout |
| `mcp/src/contract.js` | `mcp.contract` | Bridge — re-exports `API_CONTRACT`, `PARAMS` etc from `apiContract.js`; defines `TOOL_PARAM_MAP` and `toRestQuery()` |
| `mcp/src/schema.js` | `mcp.schema` | Schema generators — `mcpInputSchema()`, `functionSchemas()`, `openApiSpec()` — all driven from `contract.js` |
| `mcp/package.json` | config | `@modelcontextprotocol/sdk ^1.0.0`; `"type":"module"`; `bin: {opencite-mcp}` |

## Key exports / surface

| Symbol | Kind | File | Purpose |
|---|---|---|---|
| `startStdioServer` | async fn | `server.js` | Reads env, creates server, connects StdioServerTransport |
| `createServer` | fn | `server.js` | Factory — injectable `{apiKey, baseUrl}` for testing |
| `searchScholarlySources` | async fn | `client.js` | Makes the HTTP call; returns parsed JSON or `{_text}` for non-JSON formats |
| `resolveBaseUrl` | fn | `client.js` | Validates and normalises the base URL; enforces TLS except localhost |
| `toRestQuery` | fn | `contract.js` | Translates agent-facing args (`query`→`q`) to REST params |
| `toolParamDefs` | fn | `contract.js` | Returns per-param descriptors keyed by agent-facing name |
| `mcpInputSchema` | fn | `schema.js` | JSON Schema object for the MCP tool's `inputSchema` |
| `mcpToolDefinition` | fn | `schema.js` | Full MCP tool descriptor (`name + description + inputSchema`) |
| `functionSchemas` | fn | `schema.js` | `{openai, anthropic}` function-tool blocks for direct injection |
| `openApiSpec` | fn | `schema.js` | OpenAPI 3.1 doc for the raw REST endpoint |

## Dependencies

- Imports: `api/_shared/apiContract.js` (via relative path `../../api/_shared/apiContract.js`), `@modelcontextprotocol/sdk`
- Imported by: nothing in the main project tree (standalone package)
- No Prisma, no `src/` imports, no secrets held in-package

## Tool parameters (agent-facing)

The tool exposes a curated 3-param subset of the full REST contract. `sources` is intentionally hidden (origin-blind positioning). `mailto` and `authors` are left for direct REST callers.

| Agent arg | REST param | Required | Type | Constraints |
|---|---|---|---|---|
| `query` | `q` | yes | string | — |
| `limit` | `limit` | no | integer | 1–100, default 25 |
| `format` | `format` | no | string | json\|mla\|apa\|bibtex\|ris\|csl-json |

## Auth and key handling

Config is injected via MCP client `env` block (never embedded in code):

| Env var | Default | Notes |
|---|---|---|
| `OPENCITE_API_KEY` | unset | Forwarded verbatim as `x-api-key` header. **Never logged, never echoed** (`client.js:42`). Catch blocks surface `err.message` only — never include headers. |
| `OPENCITE_API_BASE_URL` | `https://citation.today` | Endpoint override. Non-HTTPS non-localhost rejected at `resolveBaseUrl` (`client.js:21–29`). |

The key is read once in `startStdioServer` (`server.js:58`) and passed to `createServer`; it never touches stdout (the MCP protocol stream). Startup log goes to stderr only (`server.js:64`).

## Behaviour / data flow

```
AI client  ──stdio──>  bin/opencite-mcp.js
                         └─ startStdioServer()
                              └─ createServer({apiKey, baseUrl})
                                   ├─ ListToolsRequest → [mcpToolDefinition()]
                                   └─ CallToolRequest(search_scholarly_sources, args)
                                        └─ searchScholarlySources(args, {apiKey, baseUrl})
                                             ├─ toRestQuery(args)  → {q, limit, format}
                                             └─ GET /api/search?... x-api-key: key
                                                  └─ JSON body or {_text} → MCP content block
```

Non-JSON format responses (mla/apa/bibtex/ris) arrive as `text/plain` and are returned as `{_text: string}` to the AI client. The caller must detect and unwrap.

On tool call error: `client.js` always throws without headers; `server.js` catches and returns `{isError:true, content:[{type:text,text:err.message}]}` — the key cannot leak this way.

## Relationship to api/search.js

The MCP server is explicitly **outside** the `api/` tree and makes no direct function calls into it. It relies solely on the HTTP contract. This means:

- Credit billing is enforced by `api/search.js` normally (if an API key is supplied).
- Rate limiting applies identically to any other caller.
- Origin-blind invariant is maintained: the MCP server never sees adapter IDs; it returns whatever the API emits.
- Any future RRF/scoring improvements ship transparently to MCP callers.

## Relationship to v0.37 acquisition funnel

Sprint log v0.37 plans to use the MCP schema exports (`functionSchemas()`, `openApiSpec()`) as the registration artifacts for ChatGPT/Claude/Gemini plugin listings. The `print-schemas` script (`npm run print-schemas`) emits a JSON blob containing all three. No additional MCP code changes are required for v0.37 — the funnel changes are in `api/search.js` (per-IP trial gate) and the post-OAuth UI.

## Install / run

```bash
cd mcp && npm install
node bin/opencite-mcp.js                  # stdio server

# Claude Desktop config:
# "opencite": { "command": "node", "args": ["/abs/path/mcp/bin/opencite-mcp.js"],
#               "env": { "OPENCITE_API_KEY": "oc_live_..." } }

npm run print-schemas                     # print MCP + OpenAI/Anthropic + OpenAPI schemas
```

## 🩺 Health audit

- **Verdict:** healthy — clean separation, DRY contract, good key hygiene.
- **Findings:**
  - [F-500] `@modelcontextprotocol/sdk ^1.0.0` — semver range allows any `1.x` release; the SDK has had breaking changes between minor versions. Pin to a tested exact version.
  - [F-501] Non-JSON format responses return `{_text: string}` with no schema documentation; AI clients that expect a JSON object will silently receive `"[object Object]"` or similar. A format guard or explicit documentation of the `_text` shape is missing from the MCP tool description.
- **Reuse:** contract is genuinely DRY — `api/_shared/apiContract.js` is the single SSOT; `mcp/src/contract.js` re-exports it without copy-paste. See [Duplication-and-Reuse](../09-Audit/Duplication-and-Reuse.md#r-500).
- **Smells:** `TOOL_PARAM_MAP` in `contract.js:27` is a hand-maintained map; if a new REST param is added to `PARAMS` it is silently omitted from the tool unless the map is updated. There is no lint/test that would catch the omission.

## See also

[Search-Endpoint](../04-Backend-API/Search-Endpoint.md) · [Billing-Credits](../05-Billing/Billing-Credits.md) · [Build-Deploy](../08-Build-Deploy/Build-Deploy.md)
