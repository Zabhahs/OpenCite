// Vendor the API contract SSOT into the package.
//
// mcp/src/contract.js used to import ../../api/_shared/apiContract.js directly, which works from a
// repo checkout but not from the published npm tarball (nothing outside mcp/ ships). This copies the
// SSOT into src/apiContract.js; `prepublishOnly` runs it so the published copy can never be stale.
// Never edit src/apiContract.js by hand — edit api/_shared/apiContract.js and re-run.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "api", "_shared", "apiContract.js");
const dst = join(here, "..", "src", "apiContract.js");
const banner =
  "// GENERATED COPY — do not edit. Source of truth: api/_shared/apiContract.js\n" +
  "// Regenerate with `npm run sync-contract` (runs automatically on prepublishOnly).\n";
writeFileSync(dst, banner + readFileSync(src, "utf8"));
console.log("synced api/_shared/apiContract.js → mcp/src/apiContract.js");
