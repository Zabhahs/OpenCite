// OpenCITE — Panels (v.19)
// SettingsPanel, HistoryPanel, LibraryPanel
// v.19: SettingsPanel gains admin prop + debug log section

import React, { useState, useCallback } from "react";
import { TAG_VOCAB, ADAPTER_CATEGORY } from "../constants/vocabulary.js";
import { DEFAULT_CURATED_JOURNALS, REGION_ORDER } from "../constants/defaults.js";
import { ResultCard } from "./ResultCard.jsx";
import { libraryKey } from "../lib/library.js";
import {
  buildMLA, buildAPA, segmentsToPlain,
  buildBibTeX, buildRIS, buildCSL,
} from "../lib/citations.js";
import { normalizeRecord, createDedupMap } from "../adapters/_shared/normalize.js";
import { AbstractAdapter } from "../adapters/_shared/base.js";
import { getDebugLog, downloadDebugLog, clearDebugLog } from "../lib/log.js";
import { SUBSCRIPTION_PLANS, CREDIT_PACKS, COVERAGE_NOTE } from "../constants/pricing.js";
import { subscriptionRail, storeName } from "../lib/platform.js";
import { createCheckoutSession } from "../lib/checkout.js";

function toNCR(item) {
  if (item._normalized) return item;
  const sanitized = AbstractAdapter.sanitize(item);
  const dedupMap = createDedupMap();
  return normalizeRecord(sanitized, item.source || "library", dedupMap) ?? sanitized;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const datestamp = () => new Date().toISOString().slice(0, 10);

function exportBibliography(items) {
  const lines = [
    "OPENCITE LIBRARY EXPORT",
    `Generated ${new Date().toLocaleString()}`,
    `${items.length} item${items.length !== 1 ? "s" : ""}`,
    "",
    "=== MLA 9 ===", "",
    ...items.flatMap(item => [segmentsToPlain(buildMLA(item)), ""]),
    "",
    "=== APA 7 ===", "",
    ...items.flatMap(item => [segmentsToPlain(buildAPA(item)), ""]),
  ];
  downloadFile(lines.join("\n"), `opencite-bibliography-${datestamp()}.txt`, "text/plain");
}

function exportBibTeX(items) {
  const content = items.map(item => buildBibTeX(toNCR(item))).join("\n\n");
  downloadFile(content, `opencite-export-${datestamp()}.bib`, "text/plain");
}

function exportRIS(items) {
  const content = items.map(item => buildRIS(toNCR(item))).join("\n\n");
  downloadFile(content, `opencite-export-${datestamp()}.ris`, "text/plain");
}

function exportCSL(items) {
  const content = JSON.stringify(items.map(item => buildCSL(toNCR(item))), null, 2);
  downloadFile(content, `opencite-export-${datestamp()}.json`, "application/json");
}

export function AddJournalForm({ onAdd }) {
  const [name, setName] = useState("");
  const [issn, setIssn] = useState("");

  const normalizeIssn = (s) => {
    const cleaned = (s || "").replace(/[^0-9Xx]/g, "").toUpperCase();
    return cleaned.length === 8 ? cleaned.slice(0, 4) + "-" + cleaned.slice(4) : s;
  };

  const submit = () => {
    const finalIssn = normalizeIssn(issn);
    if (!name.trim() || !/^\d{4}-\d{3}[\dX]$/.test(finalIssn)) return;
    onAdd(name.trim(), finalIssn);
    setName(""); setIssn("");
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <input type="text" value={name} onChange={e => setName(e.target.value)}
        placeholder="Journal name"
        className="flex-1 bg-white border border-stone-400 px-3 py-2 text-sm focus:outline-none focus:border-stone-900" />
      <input type="text" value={issn} onChange={e => setIssn(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder="ISSN (e.g. 2150-8925)"
        className="sm:w-44 bg-white border border-stone-400 px-3 py-2 mono-font text-sm focus:outline-none focus:border-stone-900" />
      <button onClick={submit}
        disabled={!name.trim() || !/^\d{4}-?\d{3}[\dX]$/i.test(issn.replace(/\s/g, ""))}
        className="mono-font text-xs uppercase tracking-widest bg-stone-900 text-amber-50 px-4 py-2 hover:bg-red-900 transition disabled:opacity-30 disabled:cursor-not-allowed">
        Add
      </button>
    </div>
  );
}

export function SourcesPanel({ adapters, settings, isEnabled, onToggle }) {
  const core = adapters.filter(a => a.category === ADAPTER_CATEGORY.CORE);
  const extensions = adapters.filter(a => a.category === ADAPTER_CATEGORY.EXTENSION);
  const groups = {};
  extensions.forEach(a => {
    const region = a.region?.[0] || "global";
    if (!groups[region]) groups[region] = [];
    groups[region].push(a);
  });
  const orderedRegions = REGION_ORDER.filter(r => groups[r]?.length);

  return (
    <div className="space-y-4">
      <div>
        <p className="mono-font text-xs uppercase tracking-wider text-stone-700 mb-2">Always on (core)</p>
        <div className="space-y-1">
          {core.map(a => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <span className={`mono-font text-[10px] uppercase tracking-widest ${a.color.bg} ${a.color.text} px-2 py-0.5`}>{a.name}</span>
              <span className="text-stone-600">{a.tagline}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mono-font text-xs uppercase tracking-wider text-stone-700 mb-2">Extensions (opt-in, off by default)</p>
        <p className="text-xs text-stone-600 mb-3">Niche archives. Toggle on the ones relevant to your research. Some require their own free API key (yellow tag).</p>
        <div className="space-y-2">
          {orderedRegions.map(region => (
            <details key={region} className="group border border-stone-300 bg-white/40">
              <summary className="cursor-pointer list-none flex items-center justify-between p-3 hover:bg-stone-100/60 transition">
                <span className="display-font font-bold text-stone-900">{TAG_VOCAB.region[region]}</span>
                <span className="mono-font text-[10px] uppercase tracking-widest text-stone-600">
                  {groups[region].filter(isEnabled).length}/{groups[region].length} on{" "}
                  <span className="ml-2 inline-block group-open:rotate-180 transition">▾</span>
                </span>
              </summary>
              <div className="border-t border-stone-300 p-3 space-y-3">
                {groups[region].map(a => {
                  const enabled = isEnabled(a);
                  const needsKeyMissing = a.needsKey && !settings[a.keyName];
                  return (
                    <div key={a.id} className="flex items-start gap-3">
                      <button onClick={() => onToggle(a.id)}
                        className={`shrink-0 mt-1 w-10 h-5 rounded-full transition relative ${enabled ? "bg-stone-900" : "bg-stone-300"}`}
                        aria-label={enabled ? `Disable ${a.name}` : `Enable ${a.name}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${enabled ? "left-5" : "left-0.5"}`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className={`mono-font text-[10px] uppercase tracking-widest ${a.color.bg} ${a.color.text} px-2 py-0.5`}>{a.name}</span>
                          {a.needsKey && (
                            <span className={`mono-font text-[9px] uppercase tracking-widest px-1.5 py-0.5 ${needsKeyMissing ? "bg-red-100 text-red-900" : "bg-yellow-100 text-yellow-900"}`}>
                              {needsKeyMissing ? "key missing" : "needs key"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-700 mt-1">{a.tagline}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(a.contentType || []).map(ct => <span key={ct} className="mono-font text-[9px] uppercase tracking-widest bg-stone-200 text-stone-700 px-1.5 py-0.5">{TAG_VOCAB.contentType[ct] || ct}</span>)}
                          {(a.archiveType || []).map(at => <span key={at} className="mono-font text-[9px] uppercase tracking-widest bg-amber-100 text-amber-900 px-1.5 py-0.5">{TAG_VOCAB.archiveType[at] || at}</span>)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- PricingPanel ----------
// Clearly lists the payment options (human subscriptions + machine/API credit packs).
// Platform-aware CTA: subscriptions route to Stripe Checkout on web/desktop and to
// Apple/Google IAP on native mobile (lib/platform.subscriptionRail); packs are always
// Stripe. Web checkout opens a Stripe-hosted session via /api/checkout; the IAP rail
// shows a store notice until the native purchase bridge is wired.
//   isAuthenticated → gate: Stripe checkout requires a signed-in user.
//   onRequireAuth() → called when an unauthenticated user clicks a paid CTA.

export function PricingPanel({ platform = "web", currentPlan = "free", isAuthenticated = false, onRequireAuth }) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(null); // id of the item currently starting checkout
  const rail = subscriptionRail(platform);
  const store = storeName(platform);

  const goStripe = async (item, payload) => {
    if (!isAuthenticated) { onRequireAuth?.(); return; }
    setNotice("");
    setBusy(item.id);
    const res = await createCheckoutSession(payload);
    if (res?.url) { window.location.assign(res.url); return; } // leaving the page
    setBusy(null);
    setNotice(res?.error || "Couldn't start checkout — please try again.");
  };

  const handleSubscribe = (plan) => {
    if (rail === "iap") {
      setNotice(`${plan.label} subscriptions will be available via ${store} at launch.`);
      return;
    }
    goStripe(plan, { plan: plan.id });
  };

  const handlePack = (pack) => goStripe(pack, { pack: pack.id });

  return (
    <section className="fade-in mb-8 border-2 border-stone-900 bg-amber-50 p-5">
      <h2 className="mono-font text-xs uppercase tracking-widest text-stone-700 mb-1">Plans &amp; pricing</h2>
      <p className="text-xs text-stone-600 mb-5">
        Search across every open-access database. Upgrade for more monthly searches and the full source library.
      </p>

      {/* Human subscriptions */}
      <div className="grid gap-3 md:grid-cols-3">
        {SUBSCRIPTION_PLANS.map(plan => {
          const isCurrent = plan.id === currentPlan;
          return (
            <div key={plan.id}
              className={`flex flex-col bg-white p-4 ${plan.highlight ? "border-2 border-stone-900" : "border border-stone-300"}`}>
              <div className="flex items-baseline justify-between mb-1 gap-2">
                <span className="display-font font-bold text-lg text-stone-900">{plan.label}</span>
                {isCurrent
                  ? <span className="mono-font text-[9px] uppercase tracking-widest bg-amber-200 text-amber-900 px-2 py-0.5">Current</span>
                  : plan.highlight && <span className="mono-font text-[9px] uppercase tracking-widest bg-stone-900 text-amber-50 px-2 py-0.5">Popular</span>}
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="display-font font-black text-3xl text-stone-900">{plan.price}</span>
                <span className="mono-font text-[10px] uppercase tracking-widest text-stone-500">{plan.cadence}</span>
              </div>
              <p className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-3">{plan.tagline}</p>
              <ul className="space-y-1.5 mb-4 flex-1">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-stone-700">
                    <span className="text-amber-700 mt-0.5 shrink-0">✓</span><span>{f}</span>
                  </li>
                ))}
              </ul>
              {plan.cta ? (
                <button onClick={() => handleSubscribe(plan)} disabled={busy === plan.id}
                  className={`mono-font text-[10px] uppercase tracking-widest px-4 py-2.5 transition disabled:opacity-50 disabled:cursor-wait ${plan.highlight ? "bg-stone-900 text-amber-50 hover:bg-red-900" : "border border-stone-700 text-stone-700 hover:bg-stone-900 hover:text-amber-50 hover:border-stone-900"}`}>
                  {busy === plan.id ? "Starting…" : rail === "iap" ? `${plan.cta} · ${store}` : plan.cta}
                </button>
              ) : (
                <div className="mono-font text-[10px] uppercase tracking-widest text-stone-400 px-4 py-2.5 text-center border border-dashed border-stone-300">
                  {isCurrent ? "Your plan" : "Included free"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Machine / API credit packs */}
      <div className="mt-6 pt-5 border-t border-stone-300">
        <p className="mono-font text-xs uppercase tracking-wider text-stone-700 mb-1">For developers &amp; AI agents</p>
        <p className="text-xs text-stone-600 mb-4">
          Pay-as-you-go credit packs for the grounding API — per-query, no subscription. Bought on the web dashboard.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {CREDIT_PACKS.map(pack => (
            <div key={pack.id} className={`bg-white p-4 ${pack.best ? "border-2 border-stone-900" : "border border-stone-300"}`}>
              <div className="flex items-baseline justify-between mb-1 gap-2">
                <span className="display-font font-black text-2xl text-stone-900">{pack.price}</span>
                {pack.best && <span className="mono-font text-[9px] uppercase tracking-widest bg-stone-900 text-amber-50 px-2 py-0.5">Best value</span>}
              </div>
              <p className="text-sm text-stone-800">{pack.credits}</p>
              <p className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-3">{pack.unit}</p>
              <button onClick={() => handlePack(pack)} disabled={busy === pack.id}
                className="w-full mono-font text-[10px] uppercase tracking-widest border border-stone-700 text-stone-700 px-4 py-2 hover:bg-stone-900 hover:text-amber-50 hover:border-stone-900 transition disabled:opacity-50 disabled:cursor-wait">
                {busy === pack.id ? "Starting…" : "Buy credits"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {notice && (
        <div className="mt-5 border border-amber-300 bg-amber-100/60 px-4 py-3">
          <p className="mono-font text-[10px] uppercase tracking-widest text-amber-900">{notice}</p>
        </div>
      )}

      <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 pt-4 mt-5 border-t border-stone-300 leading-relaxed">
        {COVERAGE_NOTE}
      </p>
    </section>
  );
}

// ---------- SettingsPanel ----------
// v.19: accepts admin prop — shows debug section when true

export function SettingsPanel({ settings, onSave, adapters, isEnabled, onToggle, admin }) {
  const s = settings;
  const upd = (patch) => onSave({ ...s, ...patch });

  return (
    <section className="fade-in mb-8 border-2 border-stone-900 bg-amber-50 p-5">
      <h2 className="mono-font text-xs uppercase tracking-widest text-stone-700 mb-4">Settings</h2>
      <div className="space-y-4">
        {[
          ["europeanaKey", "Europeana API key", "required for Europeana", "Free + instant. Register at api.europeana.eu."],
          ["openAlexKey", "OpenAlex API key", "optional", "Works without a key (rate-limited). Free 30-second signup at openalex.org/settings/api."],
          ["crossrefEmail", "Email for Crossref polite pool", "optional, faster + nicer", "Crossref lets you opt into a faster lane with just your email — no signup."],
        ].map(([field, label, note, help]) => (
          <div key={field}>
            <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-1">
              {label} <span className="text-stone-500">({note})</span>
            </label>
            <input type={field === "crossrefEmail" ? "email" : "text"}
              value={s[field] || ""}
              onChange={e => upd({ [field]: e.target.value })}
              className="w-full bg-white border border-stone-400 px-3 py-2 mono-font text-sm focus:outline-none focus:border-stone-900" />
            <p className="text-xs text-stone-600 mt-1">{help}</p>
          </div>
        ))}

        <div className="pt-4 border-t border-stone-300">
          <p className="mono-font text-xs uppercase tracking-wider text-stone-700 mb-3">Extension API keys</p>
          <div className="space-y-3">
            {[
              ["smithsonianKey", "Smithsonian API key", "Free, instant. Sign up at api.data.gov/signup."],
              ["dplaKey", "DPLA API key", "Free, request via email at pro.dp.la."],
              ["rijksKey", "Rijksmuseum API key", "Free, instant. Register a Rijksstudio account at rijksmuseum.nl."],
              ["coreKey", "CORE API key", "Free + instant at core.ac.uk/services/api. Unlocks 300M+ OA records including 300+ Indian repositories."],
              ["ndliKey", "NDLI API key", "Free at ndl.iitkgp.ac.in — register, then copy key from My Account. India's national digital library (90M+ items)."],
            ].map(([field, label, help]) => (
              <div key={field}>
                <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-1">{label}</label>
                <input type="text" value={s[field] || ""} onChange={e => upd({ [field]: e.target.value })}
                  className="w-full bg-white border border-stone-400 px-3 py-2 mono-font text-sm focus:outline-none focus:border-stone-900" />
                <p className="text-xs text-stone-600 mt-1">{help}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-stone-300">
          <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-2">
            Curated journals <span className="text-stone-500">({s.curatedJournals.length} configured)</span>
          </label>
          <p className="text-xs text-stone-600 mb-3">Find an ISSN on the journal's homepage or via portal.issn.org.</p>
          <div className="space-y-2 mb-3">
            {s.curatedJournals.map((j, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-white border border-stone-300 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-stone-900 truncate">{j.name}</div>
                  <div className="mono-font text-[10px] text-stone-500">ISSN {j.issn}</div>
                </div>
                <button onClick={() => upd({ curatedJournals: s.curatedJournals.filter((_, i) => i !== idx) })}
                  className="mono-font text-[10px] uppercase tracking-widest text-red-900 hover:text-red-700 transition shrink-0">Remove</button>
              </div>
            ))}
            {s.curatedJournals.length === 0 && (
              <p className="display-font italic text-sm text-stone-500 px-3 py-2">No journals configured — Curated Journals will show an error.</p>
            )}
          </div>
          <AddJournalForm onAdd={(name, issn) => upd({ curatedJournals: [...s.curatedJournals, { name, issn }] })} />
          {s.curatedJournals.length === 0 && (
            <button onClick={() => upd({ curatedJournals: DEFAULT_CURATED_JOURNALS })}
              className="mono-font text-[10px] uppercase tracking-widest text-stone-700 hover:text-red-900 transition mt-2 underline">
              Reset to defaults
            </button>
          )}
        </div>

        <div className="pt-4 border-t border-stone-300">
          <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-2">Result layout</label>
          <p className="text-xs text-stone-600 mb-3">
            Unified ranks results by relevance across all sources — best results first.
            Source view groups results per database for per-adapter auditing.
          </p>
          <div className="flex gap-2">
            {[["unified", "Unified (default)"], ["source", "Source view"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => upd({ viewMode: val })}
                className={`mono-font text-[10px] uppercase tracking-widest px-3 py-2 border transition ${
                  (s.viewMode || "unified") === val
                    ? "bg-stone-900 text-amber-50 border-stone-900"
                    : "bg-transparent text-stone-600 border-stone-400 hover:border-stone-700 hover:text-stone-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* v.31 — Synonym, Semantic, relevance slider & Author search moved to the
            always-visible SearchControls under the search bar (quick "Search settings"
            disclosure). Result layout stays here; Sources/keys/curated remain below. */}

        <div className="pt-4 border-t border-stone-300">
          <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-3">Sources</label>
          <SourcesPanel adapters={adapters} settings={s} isEnabled={isEnabled} onToggle={onToggle} />
        </div>

        {/* v.19 — Admin debug section, gated by isAdmin() */}
        {admin && (
          <div className="pt-4 border-t-2 border-red-900">
            <p className="mono-font text-xs uppercase tracking-widest text-red-900 mb-2">⚡ Admin · Debug log</p>
            <p className="text-xs text-stone-600 mb-3">
              Captures <code>[opencite:*]</code> tagged events from all adapters and edge routes.
              Triple-click the logo to copy buffer to clipboard.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => navigator.clipboard.writeText(getDebugLog()).catch(() => {})}
                className="mono-font text-[10px] uppercase tracking-widest bg-stone-900 text-amber-50 px-3 py-2 hover:bg-red-900 transition"
              >
                ↗ Copy log
              </button>
              <button
                onClick={downloadDebugLog}
                className="mono-font text-[10px] uppercase tracking-widest border border-stone-700 text-stone-700 px-3 py-2 hover:bg-stone-900 hover:text-amber-50 transition"
              >
                ↓ Download log
              </button>
              <button
                onClick={clearDebugLog}
                className="mono-font text-[10px] uppercase tracking-widest text-stone-500 hover:text-red-900 transition px-3 py-2"
              >
                Clear buffer
              </button>
            </div>
          </div>
        )}

        <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 pt-2 border-t border-stone-300">
          Saved locally — never sent anywhere except the relevant API.
        </p>
      </div>
    </section>
  );
}

// ---------- HistoryPanel ----------

export function HistoryPanel({ entries, onRerun, onRemove, onClear, historyMax }) {
  return (
    <section className="fade-in mb-8 border-2 border-stone-900 bg-amber-50 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="mono-font text-xs uppercase tracking-widest text-stone-700">Recent searches</h2>
        {entries.length > 0 && (
          <button onClick={onClear} className="mono-font text-[10px] uppercase tracking-widest text-stone-600 hover:text-red-900 transition">Clear all</button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="display-font italic text-sm text-stone-600">No searches yet — your history will appear here.</p>
      ) : (
        <ul className="space-y-1">
          {entries.map(entry => (
            <li key={entry.query} className="flex items-center gap-2 group">
              <button onClick={() => onRerun(entry.query)}
                className="flex-1 text-left px-3 py-2 hover:bg-amber-100 transition border border-transparent hover:border-stone-300">
                <span className="display-font text-stone-900">{entry.query}</span>
                <span className="mono-font text-[10px] text-stone-500 ml-2">
                  {new Date(entry.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </button>
              <button onClick={() => onRemove(entry.query)}
                className="mono-font text-[10px] uppercase tracking-widest text-stone-500 hover:text-red-900 transition opacity-0 group-hover:opacity-100"
                aria-label={`Remove "${entry.query}" from history`}>×</button>
            </li>
          ))}
        </ul>
      )}
      <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 pt-3 mt-3 border-t border-stone-300">
        Stored locally · last {historyMax} queries · click to re-run
      </p>
    </section>
  );
}

// ---------- LibraryPanel ----------

export function LibraryPanel({ items, onToggle, onClear, onCopy, copied }) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  const toggleSelect = useCallback((key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedKeys(new Set());
  };

  const selectedItems = items.filter(item => selectedKeys.has(libraryKey(item)));
  const hasSelection = selectedItems.length > 0;

  return (
    <section className="fade-in mb-8 border-2 border-stone-900 bg-amber-50 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="mono-font text-xs uppercase tracking-widest text-stone-700">
          Saved library{items.length > 0 ? ` · ${items.length} item${items.length !== 1 ? "s" : ""}` : ""}
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          {items.length > 0 && !selectMode && (
            <>
              <button onClick={() => exportBibliography(items)} className="mono-font text-[10px] uppercase tracking-widest text-stone-700 hover:text-red-900 transition">↓ Export all</button>
              <button onClick={() => setSelectMode(true)} className="mono-font text-[10px] uppercase tracking-widest bg-stone-900 text-amber-50 px-3 py-1.5 hover:bg-red-900 transition">✓ Select to export</button>
              <button onClick={() => { if (confirm(`Remove all ${items.length} items from your library?`)) onClear(); }} className="mono-font text-[10px] uppercase tracking-widest text-stone-600 hover:text-red-900 transition">Clear all</button>
            </>
          )}
          {selectMode && <button onClick={exitSelectMode} className="mono-font text-[10px] uppercase tracking-widest text-stone-600 hover:text-red-900 transition">✕ Cancel</button>}
        </div>
      </div>

      {selectMode && (
        <div className="mb-4 p-3 border border-stone-300 bg-white">
          <p className="mono-font text-[10px] uppercase tracking-widest text-stone-500 mb-2">
            {hasSelection ? `${selectedItems.length} selected` : "Tap items to select"}
          </p>
          {hasSelection && (
            <div className="flex flex-wrap gap-2">
              {[
                ["↓ Bibliography", () => { exportBibliography(selectedItems); exitSelectMode(); }],
                ["↓ BibTeX", () => { exportBibTeX(selectedItems); exitSelectMode(); }],
                ["↓ RIS", () => { exportRIS(selectedItems); exitSelectMode(); }],
                ["↓ CSL-JSON", () => { exportCSL(selectedItems); exitSelectMode(); }],
              ].map(([label, handler]) => (
                <button key={label} onClick={handler}
                  className="mono-font text-[10px] uppercase tracking-widest border border-stone-700 text-stone-700 px-3 py-1.5 hover:bg-stone-900 hover:text-amber-50 hover:border-stone-900 transition">
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-3">
          <p className="display-font italic text-stone-700 mb-1">No saved items yet.</p>
          <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600">Tap the ★ on any result to save it.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, i) => {
            const key = libraryKey(item);
            const isSelected = selectedKeys.has(key);
            return (
              <div key={key} onClick={selectMode ? () => toggleSelect(key) : undefined}
                className={["relative transition-all", selectMode ? "cursor-pointer" : "", isSelected ? "ring-2 ring-amber-500 ring-offset-1" : ""].join(" ")}>
                {selectMode && (
                  <div className="absolute top-3 right-3 z-10 flex items-center justify-center w-6 h-6 rounded-full border-2 border-stone-400 bg-white transition-all"
                    style={isSelected ? { borderColor: "#b45309", backgroundColor: "#b45309" } : {}}>
                    {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                )}
                <div style={selectMode ? { pointerEvents: "none" } : {}}>
                  <ResultCard result={item} index={i} onCopy={onCopy} copied={copied} isInLibrary={true} onToggleLibrary={selectMode ? null : onToggle} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 pt-3 mt-3 border-t border-stone-300">
        {selectMode ? "Select items above · export formats download a file · deselects on exit" : "Stored locally · ★ to remove · 'Select to export' for BibTeX, RIS, CSL-JSON"}
      </p>
    </section>
  );
}
