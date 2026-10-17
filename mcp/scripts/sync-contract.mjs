// Vendor the API contract SSOT into the package.
//
// mcp/src/contract.js used to import ../../api/_shared/apiContract.js directly, which works from a
// repo checkout but not from the published npm tarball (nothing outside mcp/ ships). This copies the
// SSOT into src/apiContract.js; `prepublishOnly` runs it so the published copy can never be stale.
// Never edit src/apiContract.js by hand — edit api/_shared/apiContract.js and re-run.
//
// v0.48: `--check` exits 1 when the vendored copy differs from the SSOT. The remote MCP (next
// phase) imports the vendored copy from api/, so drift would reach prod, not just npm.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "api", "_shared", "apiContract.js");
const dst = join(here, "..", "src", "apiContract.js");
const banner =
  "// GENERATED COPY — do not edit. Source of truth: api/_shared/apiContract.js\n" +
  "// Regenerate with `npm run sync-contract` (runs automatically on prepublishOnly).\n";
const expected = banner + readFileSync(src, "utf8");

if (process.argv.includes("--check")) {
  const actual = existsSync(dst) ? readFileSync(dst, "utf8") : "";
  if (actual !== expected) {
    console.error("✗ mcp/src/apiContract.js is out of date — run `npm run sync-contract` in mcp/");
    process.exit(1);
  }
  console.log("✓ mcp/src/apiContract.js matches api/_shared/apiContract.js");
} else {
  writeFileSync(dst, expected);
  console.log("synced api/_shared/apiContract.js → mcp/src/apiContract.js");
}
