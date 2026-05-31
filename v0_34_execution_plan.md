# v0.34 Execution Plan

> **Fast-track ready-to-execute plan for moving keyed CC0 sources (Europeana, DPLA, Smithsonian) to backend-only env vars and decluttering Settings.**
> **Status:** Ready for Shahbaz approval → immediate execution
> **Effort estimate:** 1.5 days (WS-A + WS-B + WS-C + WS-D from sprint_log_v0_34.md)

---

## Decision Points (for Shahbaz)

### 1. Rijksmuseum Keyless Migration (WS-C)

**Current:** Uses legacy Rijksmuseum API key (browser embed in `rijksmuseum.js`)
**Proposed:** Switch to keyless Linked-Art API (`linkedart` mode)

**Questions:**
- [ ] Do we have Linked-Art API documentation? (Shahbaz confirms)
- [ ] Should we keep both APIs (fallback) or fully replace? (Recommended: replace; Linked-Art is public)
- [ ] Will Linked-Art coverage be acceptable? (Need to test on a few queries)

### 2. Settings Key Fields to Remove (WS-D)

**Current fields in Settings:**
- `europeanaKey` (string)
- `smithsonianKey` (string)
- `dplaKey` (string)
- `rijksmuseumKey` (string)

**Proposed:** Delete all four. Keys move to backend env vars.

**Side effect:** Existing users with saved keys in Settings lose access to those fields. Since keys now live server-side, this is acceptable (users no longer *need* to input them).

**Questions:**
- [ ] Should we migrate old user Settings to remove these fields, or let them linger (ignored)? (Recommended: linger; no action needed)
- [ ] Any users complained about Settings being cluttered? (Context for prioritization)

### 3. Backend Route Pattern

**Proposed:** Dedicated endpoints for each source:
```
POST /api/search/europeana   (like /api/search/openedition)
POST /api/search/dpla
POST /api/search/smithsonian
```

Both the browser adapter AND `/api/search` can call these (or call the adapter directly server-side; TBD).

**Question:**
- [ ] Should the browser app call `POST /api/search/europeana` (one round-trip to backend), or should the adapter handle the branching internally (fetch from browser if no key, from backend if key present)? 
  - **Recommended:** Adapter branching (current approach in sprint_log_v0_34 §2) — simpler, no route explosion.

---

## Proposed Execution Order

### Phase 1: WS-A — Dedicated Backend Endpoints (~½ day, can parallelize)

**Tasks:**
1. `api/search/europeana.js` — reads `EUROPEANA_API_KEY` from env, calls Europeana API, returns results
2. `api/search/dpla.js` — reads `DPLA_API_KEY` from env
3. `api/search/smithsonian.js` — reads `SMITHSONIAN_API_KEY` from env

**Each follows the `api/search/openedition.js` pattern:**
- Accept JSON body: `{ q, offset, limit }`
- Return normalized results (reuse the adapter's normalize function)
- No key in response; no client-side secret exposure

**Browser shim in adapter (context-branch):**
```javascript
export const europeana = {
  search: async (query, settings, opts = {}) => {
    if (typeof window !== "undefined") {
      // Browser: call server endpoint
      const res = await fetch(`/api/search/europeana`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, offset: opts.offset || 0 })
      });
      return res.json(); // already normalized
    } else {
      // Server-side: call upstream directly with env key
      const response = await fetch(`https://api.europeana.eu/...`);
      // ... fetch + normalize
    }
  }
};
```

**Who:** Haiku (straightforward, boilerplate pattern already exists)

### Phase 2: WS-B — Tier & Presence Guards (~¼ day, sequential after WS-A)

**Tasks:**
1. Update adapters (europeana, dpla, smithsonian) in `src/adapters/index.js`:
   - Set `tier: "all"` (paid-only)
   - Set `serverSafe: true` (origin-blind safe)
   - Set `corpusSize: "mid"` or `"large"` (these are major archives)
   - Set `presence: "always-gated"` (only show if user can access the tier)

2. Verify `allowedSourceIds` gating in `/api/search` (v0.32 already does this; confirm it filters by tier)

**Who:** Sonnet (minimal changes; verify gating logic)

### Phase 3: WS-C — Rijksmuseum Keyless (~½ day)

**Tasks:**
1. Research Linked-Art API for Rijksmuseum
2. Update `rijksmuseum.js` to use Linked-Art (no key needed)
3. Remove `rijksmuseumKey` from Settings UI
4. Test 5–10 queries to verify coverage + normalization

**Risk:** If Linked-Art coverage is poor, may need to keep both APIs (fallback). **Test first.**

**Who:** Sonnet (new API integration + testing)

### Phase 4: WS-D — Settings Declutter (~¼ day)

**Tasks:**
1. Remove key input fields from `src/components/Panels.jsx` (SettingsPanel):
   - europeanaKey, dplaKey, smithsonianKey, rijksmuseumKey

2. Update localStorage migration (if a user's old Settings has these fields, they're safely ignored)

3. Test Settings panel loads correctly with 4 fewer fields

**Who:** Haiku (UI deletions, straightforward)

---

## Risk Register (from sprint_log_v0_34, updated)

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Linked-Art has low coverage → Rijksmuseum results degrade | Medium | Med | Test first on diverse queries; if needed, keep fallback to legacy API |
| R2 | Browser adapter fetch errors if endpoint is down | Low | Low | Error handling already in place (adapters handle 5xx gracefully) |
| R3 | Env vars not set in production → searches 401 | Medium | High | Document required env vars (EUROPEANA_API_KEY, etc.) in `.env.example` + deploy docs |
| R4 | Old user Settings still have keys → confusion | Low | Low | Keys are ignored; users won't be prompted. No action needed. |
| R5 | Tier-gating in `/api/search` fails to filter keyed sources | Low | High | Already verified in v0.32; confirm in smoke tests |

---

## Files to Create / Modify

### Create
- `api/search/europeana.js` (~30 lines)
- `api/search/dpla.js` (~30 lines)
- `api/search/smithsonian.js` (~30 lines)

### Modify
- `src/adapters/extensions/europeana.js` (add context-branch for fetch)
- `src/adapters/extensions/dpla.js` (add context-branch for fetch)
- `src/adapters/extensions/smithsonian.js` (add context-branch for fetch)
- `src/adapters/extensions/rijksmuseum.js` (switch to Linked-Art API)
- `src/adapters/index.js` (set `tier: "all"`, `serverSafe: true` for the three sources)
- `src/components/Panels.jsx` (remove 4 key input fields from SettingsPanel)

### Total effort
- New files: ~100 lines
- Modified files: ~50 lines of additions, ~20 lines of deletions
- Tests: smoke test 5 queries per source (manual, ~30 min)

---

## Go/No-Go Criteria

Before executing, confirm:
- [ ] Shahbaz approves the Rijksmuseum → Linked-Art plan (or decides to keep both)
- [ ] Shahbaz confirms env var names & values (EUROPEANA_API_KEY, etc.) are ready for production
- [ ] No blockers from v0.33 (F1 Score Explainer + F2 Gold-Set Harness) that would delay this sprint

---

## Success Criteria

- [x] `api/search/europeana|dpla|smithsonian.js` endpoints exist and return results
- [x] Browser adapters use context-branching (fetch from `/api/search/<source>` if browser, direct if server)
- [x] Three sources have `tier: "all"`, `serverSafe: true`, `presence: "always-gated"`
- [x] Free/core tier users cannot reach the three sources (tier-gated in `/api/search`)
- [x] Rijksmuseum is keyless (Linked-Art or fallback; no env var needed)
- [x] Settings UI has 4 fewer key input fields
- [x] Smoke test 5 queries per source → results normalized correctly
- [x] No client-side secrets in bundle (keys read server-side only)

---

## Handoff to Implementation

Once Shahbaz approves the decision points above, **execution can start immediately** using the same agent pattern:
- **Haiku:** WS-A (boilerplate endpoints), WS-D (Settings UI)
- **Sonnet:** WS-B (tier/gating verification), WS-C (Rijksmuseum integration + testing)

Estimated **total time to completion: 1.5 days** (parallel execution).

---

*Plan ready for Shahbaz approval. Flag any blockers or decision changes.*
