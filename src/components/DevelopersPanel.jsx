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

const curlSnippet = (key) =>
  `curl -H "x-api-key: ${key}" \\\n  "${API_BASE}/api/search?q=ottoman+manuscripts&limit=25&cite=bibtex"`;

const mcpSnippet = (key) => JSON.stringify(
  { mcpServers: { opencite: { command: "npx", args: ["-y", "opencite-mcp"], env: { OPENCITE_API_KEY: key } } } },
  null, 2
);

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

      {/* Balance */}
      <div className="flex items-baseline justify-between gap-3 bg-white border border-stone-300 px-4 py-3 mb-4">
        <div>
          <p className="mono-font text-[9px] uppercase tracking-widest text-stone-500">Balance</p>
          <p className="display-font font-bold text-lg text-stone-900">{isAuthenticated ? balanceLine : "Sign in to see your balance"}</p>
          {isAuthenticated && !unlimited && tier === "free" && (
            <p className="text-[11px] text-stone-600 mt-1">Free accounts receive 20 API credits each month. Buy a pack for more and for the full source library.</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => (isAuthenticated ? onBuyCredits?.() : onRequireAuth?.())}
          className="mono-font text-[10px] uppercase tracking-widest bg-stone-900 text-amber-50 px-4 py-2 hover:bg-red-900 transition"
        >
          Buy credits
        </button>
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

      {/* Quickstart */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="bg-white border border-stone-300 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="mono-font text-[9px] uppercase tracking-widest text-stone-500">REST · curl</p>
            <CopyButton text={curlSnippet(minted?.key || "YOUR_KEY")} />
          </div>
          <pre className="mono-font text-[11px] whitespace-pre-wrap break-all text-stone-800">{curlSnippet(minted?.key || "YOUR_KEY")}</pre>
        </div>
        <div className="bg-white border border-stone-300 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="mono-font text-[9px] uppercase tracking-widest text-stone-500">MCP · Claude Desktop / Cursor</p>
            <CopyButton text={mcpSnippet(minted?.key || "YOUR_KEY")} />
          </div>
          <pre className="mono-font text-[11px] whitespace-pre-wrap break-all text-stone-800">{mcpSnippet(minted?.key || "YOUR_KEY")}</pre>
        </div>
      </div>

      <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 pt-4 mt-4 border-t border-stone-300 leading-relaxed">
        Endpoints: /api/search · /api/citations · /api/ids ·{" "}
        <a href="/docs/" className="underline hover:text-red-900">API reference</a> ·{" "}
        <a href="/openapi.json" className="underline hover:text-red-900">OpenAPI</a> ·{" "}
        <a href="/legal/terms.html" className="underline hover:text-red-900">Terms</a>
      </p>
    </section>
  );
}
