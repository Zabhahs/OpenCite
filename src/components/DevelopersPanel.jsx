// OpenCITE — DevelopersPanel (v0.46)
//
// The self-serve path to the paid product. Before this panel existed the server could mint,
// list and revoke API keys (api/_shared/handlers/keys.js) but NO client code called it, so a
// pack buyer had credits and no way to spend them. Everything here talks to the existing
// session-authed endpoints; nothing is duplicated server-side.
//
//   GET    /api/keys        → list (prefixes only)
//   POST   /api/keys        → mint; plaintext returned EXACTLY once and shown once here
//   DELETE /api/keys?id=..  → revoke
//   GET    /api/credits     → via BillingContext (balance + tier)
//
// Props:
//   isAuthenticated  → gate: keys need a signed-in user
//   onRequireAuth()  → open the sign-in modal
//   onBuyCredits()   → open the Plans panel (packs)
//   justPaid         → true when we arrived from Stripe (?checkout=success): show the confirmation

import React, { useCallback, useEffect, useState } from "react";
import { apiCall } from "../lib/api.js";
import { useBilling } from "../contexts/BillingContext.jsx";

const API_BASE = "https://citation.today";

// v0.48: the quickstart leads with verification — the anti-hallucination call.
const curlSnippet = (key) =>
  `curl -X POST ${API_BASE}/api/verify \\\n  -H "x-api-key: ${key}" -H "content-type: application/json" \\\n  -d '{"refs":["10.1016/S0140-6736(97)11096-0"],"style":"apa"}'`;

const mcpSnippet = (key) => JSON.stringify(
  { mcpServers: { opencite: { command: "npx", args: ["-y", "opencite-mcp"], env: { OPENCITE_API_KEY: key } } } },
  null, 2
);
const claudeCodeSnippet = (key) => `claude mcp add opencite -e OPENCITE_API_KEY=${key} -- npx -y opencite-mcp`;

const CAP_MIN = 5, CAP_MAX = 1000;

function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="mono-font text-[9px] uppercase tracking-widest border border-stone-700 text-stone-700 px-2 py-1 hover:bg-stone-900 hover:text-amber-50 transition"
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function DevelopersPanel({ isAuthenticated = false, onRequireAuth, onBuyCredits, justPaid = false }) {
  const { credits, unlimited, tier } = useBilling();
  const [keys, setKeys] = useState(null);       // null = not loaded
  const [minted, setMinted] = useState(null);   // { key, prefix } — plaintext shown once
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  // v0.48: the three-bucket balance detail + metered state (GET /api/credits) and the spend cap.
  const [detail, setDetail] = useState(null);
  const [capDraft, setCapDraft] = useState("");
  const [capBusy, setCapBusy] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const r = await apiCall("/api/credits", "GET");
      if (!r.ok) return;
      const d = await r.json();
      setDetail(d);
      if (d?.metered?.cap_usd != null) setCapDraft(String(d.metered.cap_usd));
    } catch { /* balance stays as BillingContext shows it */ }
  }, [isAuthenticated]);
  useEffect(() => { loadDetail(); }, [loadDetail, justPaid]);

  const saveCap = async () => {
    const v = Number(capDraft);
    if (!Number.isFinite(v)) return;
    setCapBusy(true);
    try {
      const r = await apiCall("/api/credits", "PATCH", { cap_usd: Math.min(CAP_MAX, Math.max(CAP_MIN, v)) });
      if (r.ok) await loadDetail(); else setError("Couldn't update the cap.");
    } catch { setError("Network error — please retry."); }
    finally { setCapBusy(false); }
  };

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const r = await apiCall("/api/keys", "GET");
      if (!r.ok) { setError(r.status === 401 ? "Sign in to manage API keys." : "Couldn't load your keys."); return; }
      const data = await r.json();
      setKeys((data.keys || []).filter(k => !k.revoked));
      setError("");
    } catch { setError("Network error — please retry."); }
  }, [isAuthenticated]);

  useEffect(() => { load(); }, [load]);

  const mint = async () => {
    if (!isAuthenticated) { onRequireAuth?.(); return; }
    setBusy(true); setError("");
    try {
      const r = await apiCall("/api/keys", "POST");
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setError(data.error || "Couldn't create a key."); return; }
      setMinted({ key: data.key, prefix: data.prefix });
      await load();
    } catch { setError("Network error — please retry."); }
    finally { setBusy(false); }
  };

  const revoke = async (id) => {
    setBusy(true); setError("");
    try {
      const r = await apiCall(`/api/keys?id=${encodeURIComponent(id)}`, "DELETE");
      if (!r.ok) setError("Couldn't revoke that key.");
      setConfirmRevoke(null);
      await load();
    } catch { setError("Network error — please retry."); }
    finally { setBusy(false); }
  };

  const balanceLine = unlimited
    ? "Unlimited (admin)"
    : credits == null ? "—" : `${Number(credits).toLocaleString()} credits`;

  return (
    <section className="fade-in mb-8 border-2 border-stone-900 bg-amber-50 p-5">
      <h2 className="mono-font text-xs uppercase tracking-widest text-stone-700 mb-1">Developers &amp; AI agents</h2>
      <p className="text-xs text-stone-600 mb-4">
        Verify references before citing them (retracted? fabricated? wrong DOI?), search 250M+ open-access papers plus museum,
        library, manuscript and Islamicate archives, and fetch any work by DOI, PMID or PMCID. Every record names its source and
        carries an integrity check. 1 credit per search, 0.1 per reference verified, prorated by the coverage actually delivered.
      </p>

      {justPaid && (
        <div className="mb-4 border border-emerald-400 bg-emerald-50 px-4 py-3">
          <p className="mono-font text-[10px] uppercase tracking-widest text-emerald-900">
            Payment received — your credits are being added. Create a key below and start calling.
          </p>
        </div>
      )}

      {/* Balance — v0.48: allowance + purchased, plus metered state on pay as you go */}
      <div className="bg-white border border-stone-300 px-4 py-3 mb-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="mono-font text-[9px] uppercase tracking-widest text-stone-500">Balance</p>
            <p className="display-font font-bold text-lg text-stone-900">{isAuthenticated ? balanceLine : "Sign in to see your balance"}</p>
            {isAuthenticated && !unlimited && detail && (
              <p className="text-[11px] text-stone-600 mt-1">
                {detail.allowance.toLocaleString()} monthly allowance · {detail.purchased.toLocaleString()} purchased
                {detail.metered ? ` · ${detail.metered.usage_units.toLocaleString()} metered this period (≈ $${detail.metered.est_usd.toFixed(2)})` : ""}
              </p>
            )}
            {isAuthenticated && !unlimited && tier === "free" && (
              <p className="text-[11px] text-stone-600 mt-1">
                Free accounts have no API credits. Start pay as you go (1,000 calls a month included, then $2.50 per 1,000) or buy a pack.
                Reference checks stay free up to {detail?.trial?.refs_per_day ?? 25} a day.
              </p>
            )}
            {isAuthenticated && detail?.subscription_status === "past_due" && (
              <p className="mono-font text-[10px] uppercase tracking-widest text-red-900 mt-1">Payment failed — metered calls are paused until the card is updated (Manage billing).</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => (isAuthenticated ? onBuyCredits?.() : onRequireAuth?.())}
            className="mono-font text-[10px] uppercase tracking-widest bg-stone-900 text-amber-50 px-4 py-2 hover:bg-red-900 transition"
          >
            {tier === "free" ? "Plans & packs" : "Buy credits"}
          </button>
        </div>
        {isAuthenticated && detail?.metered && (
          <div className="mt-3 pt-3 border-t border-stone-200 flex flex-wrap items-center gap-3">
            <label className="mono-font text-[9px] uppercase tracking-widest text-stone-500" htmlFor="oc-cap">Monthly spend cap (USD)</label>
            <input id="oc-cap" type="number" min={CAP_MIN} max={CAP_MAX} step="1" value={capDraft} onChange={(e) => setCapDraft(e.target.value)}
              className="mono-font text-xs border border-stone-300 px-2 py-1 w-24 bg-amber-50" />
            <button type="button" onClick={saveCap} disabled={capBusy}
              className="mono-font text-[9px] uppercase tracking-widest border border-stone-700 text-stone-700 px-2 py-1 hover:bg-stone-900 hover:text-amber-50 transition disabled:opacity-50">
              {capBusy ? "Saving…" : "Save cap"}
            </button>
            <span className="text-[10px] text-stone-500">${CAP_MIN}–${CAP_MAX}. Metered calls stop at the cap until the next period.</span>
            <a href="/api/usage?format=csv" className="mono-font text-[9px] uppercase tracking-widest underline text-stone-600 hover:text-red-900 ml-auto">Download usage CSV</a>
          </div>
        )}
        {isAuthenticated && !detail?.metered && !unlimited && (
          <div className="mt-3 pt-3 border-t border-stone-200">
            <a href="/api/usage?format=csv" className="mono-font text-[9px] uppercase tracking-widest underline text-stone-600 hover:text-red-900">Download usage CSV (last 30 days)</a>
          </div>
        )}
      </div>

      {/* Keys */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="mono-font text-xs uppercase tracking-wider text-stone-700">API keys</p>
          <button
            type="button"
            onClick={mint}
            disabled={busy}
            className="mono-font text-[10px] uppercase tracking-widest border border-stone-700 text-stone-700 px-3 py-1.5 hover:bg-stone-900 hover:text-amber-50 hover:border-stone-900 transition disabled:opacity-50 disabled:cursor-wait"
          >
            {busy ? "Working…" : "Create key"}
          </button>
        </div>

        {minted && (
          <div className="border-2 border-stone-900 bg-white p-3 mb-3">
            <p className="mono-font text-[9px] uppercase tracking-widest text-red-900 mb-1">Copy this now — it is shown only once</p>
            <div className="flex items-center gap-2">
              <code className="mono-font text-xs break-all flex-1 select-all">{minted.key}</code>
              <CopyButton text={minted.key} />
            </div>
          </div>
        )}

        {!isAuthenticated && <p className="text-xs text-stone-600">Sign in with Google to create and manage keys.</p>}
        {isAuthenticated && keys && keys.length === 0 && !minted && (
          <p className="text-xs text-stone-600">No keys yet. Create one to start calling the API.</p>
        )}
        {isAuthenticated && keys && keys.length > 0 && (
          <ul className="divide-y divide-stone-200 border border-stone-300 bg-white">
            {keys.map(k => (
              <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <code className="mono-font text-xs">{k.prefix}…</code>
                  <p className="text-[10px] text-stone-500">
                    created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : " · never used"}
                  </p>
                </div>
                {confirmRevoke === k.id ? (
                  <span className="flex items-center gap-2">
                    <button type="button" onClick={() => revoke(k.id)} className="mono-font text-[9px] uppercase tracking-widest bg-red-900 text-red-50 px-2 py-1">Revoke</button>
                    <button type="button" onClick={() => setConfirmRevoke(null)} className="mono-font text-[9px] uppercase tracking-widest text-stone-500">Keep</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmRevoke(k.id)} className="mono-font text-[9px] uppercase tracking-widest text-stone-500 hover:text-red-900">revoke</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mono-font text-[10px] uppercase tracking-widest text-red-900 mt-2">{error}</p>}
      </div>

      {/* Quickstart — v0.48: verify first, then connect */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="bg-white border border-stone-300 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="mono-font text-[9px] uppercase tracking-widest text-stone-500">REST · verify a reference</p>
            <CopyButton text={curlSnippet(minted?.key || "YOUR_KEY")} />
          </div>
          <pre className="mono-font text-[11px] whitespace-pre-wrap break-all text-stone-800">{curlSnippet(minted?.key || "YOUR_KEY")}</pre>
        </div>
        <div className="bg-white border border-stone-300 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="mono-font text-[9px] uppercase tracking-widest text-stone-500">Claude Code · one line</p>
            <CopyButton text={claudeCodeSnippet(minted?.key || "YOUR_KEY")} />
          </div>
          <pre className="mono-font text-[11px] whitespace-pre-wrap break-all text-stone-800">{claudeCodeSnippet(minted?.key || "YOUR_KEY")}</pre>
        </div>
        <div className="bg-white border border-stone-300 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="mono-font text-[9px] uppercase tracking-widest text-stone-500">MCP · Claude Desktop & others</p>
            <CopyButton text={mcpSnippet(minted?.key || "YOUR_KEY")} />
          </div>
          <pre className="mono-font text-[11px] whitespace-pre-wrap break-all text-stone-800">{mcpSnippet(minted?.key || "YOUR_KEY")}</pre>
        </div>
      </div>

      <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 pt-4 mt-4 border-t border-stone-300 leading-relaxed">
        Tools: verify_citations · search_papers · get_paper · Endpoints: /api/verify · /api/search · /api/works ·{" "}
        <a href="/docs/" className="underline hover:text-red-900">API reference</a> ·{" "}
        <a href="/openapi.json" className="underline hover:text-red-900">OpenAPI</a> ·{" "}
        <a href="/legal/terms.html" className="underline hover:text-red-900">Terms</a>
      </p>
    </section>
  );
}
