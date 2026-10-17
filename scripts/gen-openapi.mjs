#!/usr/bin/env node
// Regenerate public/openapi.json from the contract SSOT.
//
//   node scripts/gen-openapi.mjs
//
// The spec is derived by mcp/src/schema.js (openApiSpec) from mcp/src/apiContract.js, which is
// itself the vendored copy of api/_shared/apiContract.js — so this script re-syncs that copy first
// and refuses to run if the sync fails. public/openapi.json is GENERATED: never hand-edit it.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
execFileSync(process.execPath, [join(root, "mcp", "scripts", "sync-contract.mjs")], { stdio: "inherit" });
const { openApiSpec } = await import(new URL("../mcp/src/schema.js", import.meta.url).href);
const out = join(root, "public", "openapi.json");
writeFileSync(out, JSON.stringify(openApiSpec(), null, 2) + "\n");
console.log(`wrote ${out}`);
