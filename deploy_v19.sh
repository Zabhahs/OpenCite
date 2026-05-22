#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# OpenCITE v.19 — Diagnostics Sprint Deploy Script
# Run from the root of your local opencite git repo:
#   chmod +x deploy_v19.sh && ./deploy_v19.sh
#
# What it does:
#   1. Creates 3 new files (src/lib/log.js, src/lib/admin.js, api/_shared/log.js)
#   2. Patches existing files with targeted sed edits (no full rewrites)
#   3. Creates .env.local.example
#   4. Commits and pushes to trigger Vercel deploy
#
# PRE-REQUISITES:
#   - Set VITE_ADMIN_EMAILS=shahbaz.citationtoday@gmail.com in Vercel dashboard
#     (Production + Preview + Development) BEFORE deploying
#   - You're on the branch you want to deploy from
# ============================================================================

echo "═══ OpenCITE v.19 — Diagnostics Sprint ═══"
echo ""

# ── Safety check ──
if [ ! -f "src/App.jsx" ]; then
  echo "ERROR: Run this from the opencite repo root (where src/App.jsx lives)"
  exit 1
fi

# ════════════════════════════════════════════════════════════════════════════
# PART 1 — NEW FILES
# ════════════════════════════════════════════════════════════════════════════

echo "[1/5] Creating new files..."

# ── src/lib/log.js — Client Logger SSOT ──
cat > src/lib/log.js << 'LOGEOF'
// OpenCITE — Client Logger SSOT (v.19)
// Usage: import { log } from '../lib/log.js';
//   log('BDPI', 'start', { q: query });
//   log.err('BDPI', 'parse-fail', { sample: text.slice(0,200) });
// Output: [opencite:BDPI:start] q="..."

const BUFFER_SIZE = 500;
let buffer = [];
let bufferActive = false;

const formatPairs = (data) => {
  if (!data || typeof data !== "object") return "";
  return Object.entries(data)
    .map(([k, v]) => {
      if (v == null) return `${k}=null`;
      if (typeof v === "string") {
        if (/[\s"=]/.test(v)) return `${k}="${v.replace(/"/g, '\\"')}"`;
        return `${k}=${v}`;
      }
      return `${k}=${v}`;
    })
    .join(" ");
};

const buildLine = (adapter, event, data) => {
  const tag = `[opencite:${adapter}:${event}]`;
  const pairs = formatPairs(data);
  return pairs ? `${tag} ${pairs}` : tag;
};

const emit = (level, adapter, event, data) => {
  const line = buildLine(adapter, event, data);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  if (bufferActive) {
    buffer.push(`${new Date().toISOString()} ${level.toUpperCase()} ${line}`);
    if (buffer.length > BUFFER_SIZE) buffer.shift();
  }
};

export function log(adapter, event, data) { emit("log", adapter, event, data); }
log.warn = (adapter, event, data) => emit("warn", adapter, event, data);
log.err  = (adapter, event, data) => emit("error", adapter, event, data);

export function installDebugLog() {
  bufferActive = true;
  if (typeof window !== "undefined" && !window.__opencite_log_installed__) {
    window.__opencite_log_installed__ = true;
    window.addEventListener("error", (e) => {
      emit("error", "window", "uncaught", { msg: e.message, src: e.filename });
    });
    window.addEventListener("unhandledrejection", (e) => {
      const msg = e.reason?.message || String(e.reason);
      emit("error", "window", "unhandled-rejection", { msg });
    });
  }
}

export function getDebugLog() { return buffer.join("\n"); }
export function clearDebugLog() { buffer = []; }
export function downloadDebugLog() {
  const blob = new Blob([buffer.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `opencite-debug-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
LOGEOF

# ── src/lib/admin.js — Admin Gate ──
cat > src/lib/admin.js << 'ADMINEOF'
// OpenCITE — Admin Gate (v.19)
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
export function isAdmin(user) {
  if (!user?.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}
ADMINEOF

# ── api/_shared/log.js — Server Logger SSOT ──
cat > api/_shared/log.js << 'SLOGEOF'
// OpenCITE — Server Logger SSOT (v.19)
// Same API as src/lib/log.js, console-only (no buffer).
const formatPairs = (data) => {
  if (!data || typeof data !== "object") return "";
  return Object.entries(data)
    .map(([k, v]) => {
      if (v == null) return `${k}=null`;
      if (typeof v === "string") {
        if (/[\s"=]/.test(v)) return `${k}="${v.replace(/"/g, '\\"')}"`;
        return `${k}=${v}`;
      }
      return `${k}=${v}`;
    })
    .join(" ");
};
const buildLine = (adapter, event, data) => {
  const tag = `[opencite:${adapter}:${event}]`;
  const pairs = formatPairs(data);
  return pairs ? `${tag} ${pairs}` : tag;
};
export function log(adapter, event, data) { console.log(buildLine(adapter, event, data)); }
log.warn = (adapter, event, data) => console.warn(buildLine(adapter, event, data));
log.err  = (adapter, event, data) => console.error(buildLine(adapter, event, data));
SLOGEOF

# ── .env.local.example ──
cat > .env.local.example << 'ENVEOF'
# Admin email(s) for debug tooling — comma-separated, lowercase
VITE_ADMIN_EMAILS=shahbaz.citationtoday@gmail.com
ENVEOF

echo "  ✓ src/lib/log.js"
echo "  ✓ src/lib/admin.js"
echo "  ✓ api/_shared/log.js"
echo "  ✓ .env.local.example"

# ════════════════════════════════════════════════════════════════════════════
# PART 2 — PATCH: src/adapters/index.js (runSearch chokepoint)
# ════════════════════════════════════════════════════════════════════════════

echo "[2/5] Patching src/adapters/index.js (runSearch logging)..."

# Add import at top (after existing imports)
sed -i '1s|^|import { log } from "../lib/log.js";\n|' src/adapters/index.js

# Wrap runSearch body with logging
sed -i '/const adapterKey = adapter\.id/a\  const startMs = Date.now();\n  log(adapterKey, "start", { q: query, offset: opts.offset || 0 });' src/adapters/index.js

# Add try/catch around adapter.search call — replace the bare call
sed -i 's|const raw = await adapter\.search(query, settings, opts);|let raw;\n  try {\n    raw = await adapter.search(query, settings, opts);\n  } catch (err) {\n    log.err(adapterKey, "adapter-error", { err: err.name || "Error", msg: err.message || String(err), ms: Date.now() - startMs });\n    throw err;\n  }|' src/adapters/index.js

# Add post-normalize logging before return
sed -i '/return { results, hasMore };/i\  if (results.length === 0) { log(adapterKey, "empty", { rawCount: rawResults.length }); }\n  else { log(adapterKey, "parse-ok", { items: results.length, ms: Date.now() - startMs }); }' src/adapters/index.js

echo "  ✓ runSearch wrapped with start/adapter-error/empty/parse-ok"

# ════════════════════════════════════════════════════════════════════════════
# PART 3 — PATCH: proxiedFetch + 10 adapter ctx args
# ════════════════════════════════════════════════════════════════════════════

echo "[3/5] Patching proxiedFetch + adapter ctx..."

# Rewrite src/adapters/_shared/proxy.js entirely (small file, safer than multi-sed)
cat > src/adapters/_shared/proxy.js << 'PROXYEOF'
import { log } from "../../lib/log.js";

const PROXY_BASE = "/api/proxy";

export async function proxiedFetch(url, options = {}, ctx = {}) {
  const adapterId = ctx.adapterId;
  const startMs = Date.now();
  if (adapterId) log(adapterId, "proxy-attempt", { url: url.slice(0, 120) });

  const proxyUrl =
    `${PROXY_BASE}?url=${encodeURIComponent(url)}` +
    (options.method && options.method !== "GET" ? `&method=${options.method}` : "");
  const fetchOpts =
    options.method === "POST"
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: options.body }
      : {};

  try {
    const response = await fetch(proxyUrl, fetchOpts);
    if (adapterId) {
      const ms = Date.now() - startMs;
      if (response.ok) log(adapterId, "proxy-ok", { status: response.status, ms });
      else log.err(adapterId, "proxy-fail", { status: response.status, ms });
    }
    return response;
  } catch (err) {
    if (adapterId) log.err(adapterId, "proxy-throw", { err: err.name, msg: err.message, ms: Date.now() - startMs });
    throw err;
  }
}
PROXYEOF

# Thread ctx into each adapter's proxiedFetch calls
# Pattern: proxiedFetch(url) → proxiedFetch(url, {}, { adapterId: "XXX" })
# Pattern: proxiedFetch(url, { method: ... }) → proxiedFetch(url, { method: ... }, { adapterId: "XXX" })

declare -A ADAPTER_FILES=(
  ["BDH"]="src/adapters/extensions/bdh.js"
  ["DELPHER"]="src/adapters/extensions/delpher.js"
  ["DPLA"]="src/adapters/extensions/dpla.js"
  ["NLS"]="src/adapters/extensions/nls.js"
  ["ONB"]="src/adapters/extensions/onb.js"
  ["BNF_API"]="src/adapters/extensions/bnfApi.js"
  ["NORTHWESTERN"]="src/adapters/extensions/northwestern.js"
  ["OPENNEURO"]="src/adapters/extensions/openNeuro.js"
  ["PANGAEA"]="src/adapters/extensions/pangaea.js"
  ["PRINCETON_DPUL"]="src/adapters/extensions/princetonDpul.js"
)

for ID in "${!ADAPTER_FILES[@]}"; do
  FILE="${ADAPTER_FILES[$ID]}"
  if [ -f "$FILE" ]; then
    # Replace proxiedFetch(someUrl) with proxiedFetch(someUrl, {}, { adapterId: "ID" })
    # Handle both one-arg and two-arg calls
    sed -i "s|proxiedFetch(sruUrl);|proxiedFetch(sruUrl, {}, { adapterId: \"$ID\" });|g" "$FILE"
    sed -i "s|proxiedFetch(url);|proxiedFetch(url, {}, { adapterId: \"$ID\" });|g" "$FILE"
    # Two-arg POST calls: proxiedFetch(url, { method: ... })  — insert ctx as 3rd arg
    # Match pattern: proxiedFetch(someVar, { — add ctx before closing )
    perl -i -pe "s/(proxiedFetch\([^,]+,\s*\{[^}]*\})\)/\$1, { adapterId: \"$ID\" })/g" "$FILE"
    echo "  ✓ $FILE → adapterId=$ID"
  else
    echo "  ⚠ $FILE not found — skipping"
  fi
done

# ════════════════════════════════════════════════════════════════════════════
# PART 4 — PATCH: Server edge routes (api/proxy.js, api/search/*.js)
# ════════════════════════════════════════════════════════════════════════════

echo "[4/5] Patching server edge routes..."

# api/proxy.js — add import + logging
sed -i '1s|^|import { log } from "./_shared/log.js";\n|' api/proxy.js
sed -i '/const { searchParams } = new URL(req.url);/i\  const startMs = Date.now();' api/proxy.js
sed -i "/return new Response(\`Domain/i\\    log.warn(\"proxy\", \"reject\", { hostname: targetUrl.hostname });" api/proxy.js
sed -i '/const targetMethod = searchParams/a\  log("proxy", "request", { hostname: targetUrl.hostname, method: targetMethod });' api/proxy.js
sed -i '/const responseHeaders = new Headers(upstreamRes.headers);/i\    log("proxy", "upstream-ok", { hostname: targetUrl.hostname, status: upstreamRes.status, ms: Date.now() - startMs });' api/proxy.js
sed -i "/error: 'Proxy Execution Error'/i\\    log.err(\"proxy\", \"upstream-error\", { hostname: targetUrl.hostname, err: error.name, msg: error.message, ms: Date.now() - startMs });" api/proxy.js
echo "  ✓ api/proxy.js"

# api/search/bdpi.js — add import + logging
sed -i '1s|^|import { log } from "../_shared/log.js";\n|' api/search/bdpi.js
sed -i '/const CALLBACK/a\  log("BDPI", "start", { q: query, page: pageNumber });' api/search/bdpi.js
sed -i '/const rawText = await response.text/a\    log("BDPI", "upstream-ok", { status: response.status, bytes: rawText.length });' api/search/bdpi.js
sed -i "/error: 'BDPI: unexpected response format'/i\\        log.err(\"BDPI\", \"parse-fail\", { sample: rawText.slice(0, 200) });" api/search/bdpi.js
sed -i "/error: 'BDPI JSON parse failed'/i\\      log.err(\"BDPI\", \"json-parse-fail\", { sample: rawText.slice(0, 200) });" api/search/bdpi.js
sed -i '/return new Response(JSON.stringify({ results: normalizedResults, total })/i\    log("BDPI", "parse-ok", { items: normalizedResults.length, total });' api/search/bdpi.js
echo "  ✓ api/search/bdpi.js"

# api/search/gallica.js — add import + logging (critical: catches DOMParser error)
sed -i '1s|^|import { log } from "../_shared/log.js";\n|' api/search/gallica.js
sed -i '/if (!query)/i\  log("GALLICA", "start", { q: query, start });' api/search/gallica.js
sed -i '/const xmlText = await response.text/a\    log("GALLICA", "upstream-ok", { status: response.status, bytes: xmlText.length });' api/search/gallica.js
sed -i '/return new Response(JSON.stringify({ results: normalizedResults, total })/i\    log("GALLICA", "parse-ok", { items: normalizedResults.length, total });' api/search/gallica.js
# The catch block — this is the smoking gun for DOMParser
sed -i '/error: isTimeout ? "Gallica timed out/i\    log.err("GALLICA", isTimeout ? "upstream-timeout" : "edge-error", { err: error.name, msg: error.message });' api/search/gallica.js
echo "  ✓ api/search/gallica.js"

# api/search/opencontext.js — add import + logging
sed -i '1s|^|import { log } from "../_shared/log.js";\n|' api/search/opencontext.js
sed -i '/if (!query)/i\  log("OPENCONTEXT", "start", { q: query, start });' api/search/opencontext.js
sed -i '/return new Response(JSON.stringify({ results: normalizedResults, total, hasMore })/i\    log("OPENCONTEXT", "parse-ok", { items: normalizedResults.length, total });' api/search/opencontext.js
echo "  ✓ api/search/opencontext.js"

# api/search/mexicana.js — add import + logging
sed -i '1s|^|import { log } from "../_shared/log.js";\n|' api/search/mexicana.js
sed -i '/let oaiUrl;/i\  log("MEXICANA", "start", { q: query, hasToken: !!token });' api/search/mexicana.js
sed -i "/throw new Error(\`Mexicana OAI-PMH/i\\    log.err(\"MEXICANA\", \"upstream-fail\", { status: res.status });" api/search/mexicana.js
sed -i '/status: 200, headers: corsHeaders/i\    log("MEXICANA", "parse-ok", { items: results.length, total: matched.length, hasMore: !!nextToken });' api/search/mexicana.js
echo "  ✓ api/search/mexicana.js"

# api/search/bl.js — add import + logging
sed -i '1s|^|import { log } from "../_shared/log.js";\n|' api/search/bl.js
sed -i '/const sparql = buildSparql/i\  log("BL", "start", { q: query, start, rows });' api/search/bl.js
sed -i "/throw new Error(\`BL SPARQL/i\\    log.err(\"BL\", \"upstream-fail\", { status: res.status });" api/search/bl.js
sed -i '/status: 200, headers: corsHeaders/i\  log("BL", "parse-ok", { items: results.length, hasMore: results.length === rows });' api/search/bl.js
echo "  ✓ api/search/bl.js"

# ════════════════════════════════════════════════════════════════════════════
# PART 5 — PATCH: App.jsx + Panels.jsx (admin UI)
# ════════════════════════════════════════════════════════════════════════════

echo "[5/5] Patching App.jsx + Panels.jsx (admin UI)..."

# App.jsx — add imports
sed -i '/import { useAuth } from "\.\/contexts\/AuthContext\.jsx";/a\
\
// v.19 — admin gate + debug log\
import { isAdmin } from "./lib/admin.js";\
import { installDebugLog, getDebugLog } from "./lib/log.js";' src/App.jsx

# App.jsx — pull user from useAuth, compute admin, install logger
sed -i 's|const { status } = useAuth();|const { status, user } = useAuth();\n  const admin = isAdmin(user);|' src/App.jsx

# App.jsx — add useEffect for logger install (after the status line)
sed -i '/const admin = isAdmin(user);/a\
\
  // v.19 — install debug logger when admin signs in\
  useEffect(() => { if (admin) installDebugLog(); }, [admin]);' src/App.jsx

# App.jsx — replace handleLogoClick with triple-click version
# We need useRef for click tracking
sed -i '/const inputRef = useRef(null);/a\  const logoClicks = useRef({ count: 0, timer: null });' src/App.jsx

sed -i '/\/\/ Logo click — close any open panel/,/}, \[reset\]);/c\
  // v.19 — triple-click logo: admin copies debug log; normal click resets\
  const handleLogoClick = useCallback(() => {\
    if (admin) {\
      logoClicks.current.count++;\
      clearTimeout(logoClicks.current.timer);\
      logoClicks.current.timer = setTimeout(() => { logoClicks.current.count = 0; }, 600);\
      if (logoClicks.current.count >= 3) {\
        logoClicks.current.count = 0;\
        navigator.clipboard.writeText(getDebugLog()).catch(() => {});\
        return;\
      }\
    }\
    setQuery("");\
    setActivePanel(null);\
    reset();\
    inputRef.current?.focus();\
  }, [admin, reset]);' src/App.jsx

# App.jsx — pass admin to SettingsPanel
sed -i 's|<SettingsPanel|<SettingsPanel\n            admin={admin}|' src/App.jsx

# Panels.jsx — add admin debug section to SettingsPanel
# Add imports at top
sed -i '1s|^|import { getDebugLog, downloadDebugLog, clearDebugLog } from "../lib/log.js";\n|' src/components/Panels.jsx

# Add admin prop to SettingsPanel
sed -i 's|export function SettingsPanel({ settings, onSave, adapters, isEnabled, onToggle })|export function SettingsPanel({ settings, onSave, adapters, isEnabled, onToggle, admin })|' src/components/Panels.jsx

# Add admin debug section before the closing </div></section> of SettingsPanel
# Find the "Saved locally" text and add admin section before it
sed -i '/Saved locally — never sent anywhere except the relevant API\./i\
        {admin && (\
          <div className="pt-4 border-t-2 border-red-900">\
            <p className="mono-font text-xs uppercase tracking-widest text-red-900 mb-2">⚡ Admin · Debug log</p>\
            <p className="text-xs text-stone-600 mb-3">Captures server-tagged events and client errors. Triple-click the logo to copy to clipboard.</p>\
            <div className="flex gap-2 flex-wrap">\
              <button onClick={() => navigator.clipboard.writeText(getDebugLog())}\
                className="mono-font text-[10px] uppercase tracking-widest bg-stone-900 text-amber-50 px-3 py-2 hover:bg-red-900 transition">\
                ↗ Copy log\
              </button>\
              <button onClick={downloadDebugLog}\
                className="mono-font text-[10px] uppercase tracking-widest border border-stone-700 text-stone-700 px-3 py-2 hover:bg-stone-900 hover:text-amber-50 transition">\
                ↓ Download log\
              </button>\
              <button onClick={clearDebugLog}\
                className="mono-font text-[10px] uppercase tracking-widest text-stone-500 hover:text-red-900 transition px-3 py-2">\
                Clear buffer\
              </button>\
            </div>\
          </div>\
        )}' src/components/Panels.jsx

echo "  ✓ App.jsx — admin gate + triple-click + logger install"
echo "  ✓ Panels.jsx — admin debug section"

# ════════════════════════════════════════════════════════════════════════════
# COMMIT + PUSH
# ════════════════════════════════════════════════════════════════════════════

echo ""
echo "═══ All patches applied. Staging + committing... ═══"

git add -A
git commit -m "v.19 — diagnostics sprint: SSOT logger + admin debug UI

Server-side:
- api/_shared/log.js: server logger SSOT
- api/proxy.js: tagged request/upstream-ok/upstream-error/reject
- api/search/bdpi.js: start/upstream-ok/parse-fail(with sample)/parse-ok
- api/search/gallica.js: start/upstream-ok/edge-error(DOMParser?)/parse-ok
- api/search/opencontext.js: start/parse-ok
- api/search/mexicana.js: start/upstream-fail/parse-ok
- api/search/bl.js: start/upstream-fail/parse-ok

Client-side:
- src/lib/log.js: client logger SSOT (ring buffer + console)
- src/lib/admin.js: VITE_ADMIN_EMAILS gate
- src/adapters/index.js: runSearch() wrapped with start/adapter-error/empty/parse-ok
- src/adapters/_shared/proxy.js: ctx param, logs proxy-attempt/ok/fail/throw
- 10 adapter files: ctx threaded to proxiedFetch calls

Admin UI:
- App.jsx: installDebugLog on admin sign-in, triple-click logo copies buffer
- Panels.jsx: SettingsPanel admin debug section (copy/download/clear)

Zero logic changes. Zero adapter behaviour changes. Diagnostics only."

echo ""
echo "═══ Pushing to origin... ═══"
git push

echo ""
echo "═══ DONE ═══"
echo ""
echo "Next steps:"
echo "  1. Verify VITE_ADMIN_EMAILS is set in Vercel dashboard"
echo "  2. Wait for Vercel deploy to complete"
echo "  3. Sign in with shahbaz.citationtoday@gmail.com"
echo "  4. Run searches: 'Tepehuan', 'climate change', '10.1038/nature12373'"
echo "  5. Settings → ⚡ Admin → Download log (after each search)"
echo "  6. Terminal: vercel logs --follow (save output)"
echo "  7. Paste all 4 files (3 client + 1 server) back in chat → plan v.20"
