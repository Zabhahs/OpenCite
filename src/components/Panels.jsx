import React, { useState } from "react";
import { TAG_VOCAB, ADAPTER_CATEGORY } from "../constants/vocabulary.js";
import { DEFAULT_CURATED_JOURNALS, REGION_ORDER } from "../constants/defaults.js";
import { ResultCard } from "./ResultCard.jsx";
import { libraryKey } from "../lib/library.js";

// ---------- AddJournalForm ----------

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
      <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Journal name"
        className="flex-1 bg-white border border-stone-400 px-3 py-2 text-sm focus:outline-none focus:border-stone-900" />
      <input type="text" value={issn} onChange={e => setIssn(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()}
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

// ---------- SourcesPanel ----------

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
                  {groups[region].filter(isEnabled).length}/{groups[region].length} on <span className="ml-2 inline-block group-open:rotate-180 transition">▾</span>
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

// ---------- SettingsPanel ----------

export function SettingsPanel({ settings, onSave, adapters, isEnabled, onToggle }) {
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
          ["s2Key", "Semantic Scholar API key", "optional", "Free but approval can take days. Request at semanticscholar.org/product/api."],
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
          <label className="mono-font text-xs uppercase tracking-wider text-stone-700 block mb-3">Sources</label>
          <SourcesPanel adapters={adapters} settings={s} isEnabled={isEnabled} onToggle={onToggle} />
        </div>

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

export function LibraryPanel({ items, onToggle, onExport, onClear, onCopy, copied }) {
  return (
    <section className="fade-in mb-8 border-2 border-stone-900 bg-amber-50 p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="mono-font text-xs uppercase tracking-widest text-stone-700">
          Saved library {items.length > 0 && `· ${items.length} item${items.length !== 1 ? "s" : ""}`}
        </h2>
        {items.length > 0 && (
          <div className="flex items-center gap-3">
            <button onClick={onExport} className="mono-font text-[10px] uppercase tracking-widest text-stone-700 hover:text-red-900 transition">↓ Export bibliography</button>
            <button onClick={() => { if (confirm(`Remove all ${items.length} items from your library?`)) onClear(); }}
              className="mono-font text-[10px] uppercase tracking-widest text-stone-600 hover:text-red-900 transition">Clear all</button>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <div className="py-3">
          <p className="display-font italic text-stone-700 mb-1">No saved items yet.</p>
          <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600">Tap the ☆ on any result to save it.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, i) => (
            <ResultCard key={libraryKey(item)} result={item} index={i}
              onCopy={onCopy} copied={copied} isInLibrary={true} onToggleLibrary={onToggle} />
          ))}
        </div>
      )}
      <p className="mono-font text-[10px] uppercase tracking-widest text-stone-600 pt-3 mt-3 border-t border-stone-300">
        Stored locally · click ★ on any item to remove · export creates a .txt with MLA + APA
      </p>
    </section>
  );
}
