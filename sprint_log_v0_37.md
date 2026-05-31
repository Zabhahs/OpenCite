# OpenCITE — Sprint Log v0.37

> **MCP acquisition + monetization funnel.**
> Converts external AI model discovery into paying customers via per-IP trials, post-OAuth AI connection selection, and in-context paywall.
> Builds on v0.30 (Stripe checkout live), v0.32 (credit meter + identity system), and v0.34 (backend keys).
>
> **Created:** 2026-05-31 · **Status:** PLAN READY (awaiting Shahbaz execution approval).
> **Mode:** C (plan → approval → execute → checklist).

---

## 0. TL;DR

External AI models (ChatGPT, Claude, etc.) discovering OpenCITE's MCP today hit an unauthenticated endpoint with no way to sign up or pay. v0.37 closes that funnel with two paths:

**External discovery (forced):** unauthenticated callers get a **per-IP trial quota** (5 searches/week); when exhausted, they sign up → **immediately land on `/auth/connect-ai`** (forced AI selection) → generate an API key → paste into their AI → future calls auto-meter against their tier.

**Web/app users (optional):** existing logged-in users can optionally enable "Connect to your AI" in Settings > API & Integrations → one-click `/settings/connect-ai` → generate key → manage/revoke anytime.

**Result:** every external discovery becomes a customer path from day 1; existing users get a frictionless MCP bonus without disrupting their workflow.

---

## 1. Context — why now, and why it matters

### The problem
v0.30 shipped `/api/search` (origin-blind, deduped, ranked, citation-ready). v0.34 ships backend-keyed Wave-3 sources (Europeana, DPLA, Smithsonian). **But:** if a ChatGPT user asks "find verified sources on X" and ChatGPT's MCP discovers OpenCITE, that user:
- Makes an unauthenticated call
- Sees results
- Wants more next week → **hits a wall with no path forward** (no trial, no signup, no paywall)
- Abandons

We lose the customer *at the moment they've already proved intent.*

### The opportunity
Unauthenticated AI callers are **acquired at zero cost** (discovery is algorithmic). A small trial quota (5 searches) proves value *without signup friction*. On exhaust or after OAuth login, a **one-click "Connect to ChatGPT/Claude/Gemini"** flow auto-generates an API key → they paste it into their AI's settings → future calls meter. They never leave their study flow. We capture tier + payment method via Stripe (already live, v0.30 WS3).

**Why v0.37:** v0.32 has metered credit identity. v0.34 has backend key gating. The pieces exist; v0.37 wires them into a conversion funnel.

---

## 2. User journeys

### 2A. External AI discovery (unauthenticated → forced AI connection)

```
External AI user (ChatGPT, Claude, Gemini)
  ↓
"Find verified sources on quantum computing"
  ↓ (ChatGPT's MCP discovers OpenCITE, calls /api/search unauthenticated)
  ↓
OpenCITE endpoint sees no auth → checks per-IP trial quota
  ↓ (IP is new, has 5 trials remaining)
  ↓ Returns results + response footer: "Trial: 4 searches left. Sign up for unlimited."
  ↓
User clicks signup link in the footer
  ↓ (redirects to /auth with OAuth Google/GitHub)
  ↓
User authenticates
  ↓ (OAuth callback → /auth/connect-ai, **NOT /settings or /dashboard**)
  ↓ === IMMEDIATE AI SELECTION PAGE (FORCED) ===
  ↓
"Which AI do you study with?"
  [ChatGPT] [Claude] [Gemini]
  ↓ (user clicks Claude)
  ↓
API key auto-generated, copy-paste instructions shown:
  "1. In Claude settings, go to Tools > Add Tool
   2. Paste this config: [schema]
   3. Set API Key: sb_pk_..._xxxx
   4. Done! Ask Claude for sources."
  ↓
User pastes into Claude settings
  ↓ (Claude now sends Authorization: Bearer sb_pk_..._xxxx with each call)
  ↓
Next search: /api/search hits the key → resolves to user_id → looks up plan (free, $5, $10)
  ↓
If free tier exhausted → 402 response: "Upgrade to Pro ($10/1K/mo) or buy a pack (+100 for $5)"
  ↓ [link to /plans]
  ↓
User buys Pro tier → Stripe checkout (v0.30 live) → webhook grants 1,000 credits for the month
  ↓
Claude resumes searching, now with 1,000 credits
```

### 2B. Web/app user (optional AI connection in settings)

```
Existing OpenCITE user (logged in via web/app)
  ↓
Goes to Settings > API & Integrations
  ↓
Sees optional card: "Connect to your AI for one-click sourcing"
  ↓
Clicks "Enable" → redirects to /settings/connect-ai
  ↓ === AI SELECTION PAGE (OPTIONAL) ===
  ↓
"Which AI do you study with?" [with "Skip for now" button]
  [ChatGPT] [Claude] [Gemini]
  ↓ (user clicks Claude, or skips)
  ↓
If selected: API key auto-generated, instructions shown (same as 2A)
  ↓
User can update/revoke keys in Settings anytime
  ↓
(No forced conversion, no paywall interruption — optional enhancement)
```

---

## 3. What needs to ship

### 3.1 Per-IP trial quota tracking
- **Where:** Redis or in-memory cache (node-cache for MVP)
- **Tracking:** `{ [ip]: { searched: N, resetDate: '2026-05-31' } }`
- **Reset:** weekly (resetting midnight UTC or relative to user's timezone — suggest UTC for simplicity)
- **Quota:** 5 searches/week (configurable)
- **Implementation:** middleware in `/api/search` before auth check
  ```
  if (no auth header && IP has trial quota) {
    decrement quota
    execute request
    include remaining in response header + footer
  } else if (no auth && IP quota exhausted) {
    return 402 {
      error: "trial_exhausted",
      message: "You've used your 5 weekly trial searches.",
      signup_url: "https://opencite.space/auth?redirect=/auth/connect-ai"
    }
  }
  ```

### 3.2 AI connection pages (two routes, same component)

#### 3.2a. Post-OAuth forced connection (`/auth/connect-ai`)
- **Route:** new React page, protected (requires `session` from OAuth callback)
- **Flow:** OAuth callback redirects here immediately after login
- **Display:** "Which AI do you study with?" with 3 cards (ChatGPT, Claude, Gemini)
- **Buttons:** required selection (no skip) → "Set it up later" dismisses to dashboard
- **Interaction:** user clicks AI → `POST /api/auth/connect-ai?model=chatgpt`
  - Auto-generates API key (calls `POST /api/keys/generate`)
  - Stores `model` in `ai_connections` table
  - Shows model-specific setup instructions (copy-paste)
  - Dismiss button → go to dashboard
- **Styling:** match existing auth page (e.g., `AuthPage.jsx` aesthetic)

#### 3.2b. Optional settings connection (`/settings/connect-ai`)
- **Route:** new React page under Settings, protected (requires existing `session`)
- **Access:** Settings > "API & Integrations" card → "Connect to AI" button
- **Display:** same "Which AI do you study with?" with 3 cards
- **Buttons:** optional selection (include "Skip for now") → "Skip" returns to Settings
- **Interaction:** same as above (POST to same endpoint)
- **Styling:** match existing Settings aesthetics
- **Additional:** show existing connections + revoke/manage options

#### Shared component
- **Component:** `AIConnectionSelector.jsx` (reusable for both routes)
- **Props:** `{ required: bool, onSelect: fn, onSkip: fn }`
- **Setup instructions:** same static config, displayed identically in both flows

### 3.3 API key generation & management
- **New table:** `ai_connections` (or extend `api_keys`)
  ```sql
  CREATE TABLE ai_connections (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(internal_id) ON DELETE CASCADE,
    connected_model TEXT NOT NULL, -- 'chatgpt' | 'claude' | 'gemini'
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    connected_at TIMESTAMP DEFAULT now(),
    last_used_at TIMESTAMP,
    UNIQUE(user_id, connected_model)
  );
  ```
- **Endpoint:** `POST /api/keys/generate`
  - Session-authed (reuse `getSession`)
  - Generates random `key_xxx_XXXXXXXXXXXXXXXXXXXX` (format: 40+ chars, URL-safe base64)
  - Hashes key → stores in `api_keys` with `user_id`
  - Returns unhashed key (only shown once, emphasize copy-to-clipboard)
  - Response: `{ key: "sb_pk_...", setupUrl: "https://..." }`
- **Endpoint:** `POST /api/auth/connect-ai`
  - Session-authed
  - Required param: `model` (validate against `['chatgpt', 'claude', 'gemini']`)
  - Calls `POST /api/keys/generate` to get key
  - Inserts into `ai_connections` or updates existing
  - Returns: `{ key, model, instructions }`

### 3.4 Model-specific setup instructions (config)
- **File:** `src/constants/aiModels.js` (or inline in endpoint response)
  ```js
  export const AI_SETUP_INSTRUCTIONS = {
    chatgpt: {
      name: "ChatGPT",
      icon: "https://...",
      steps: [
        "1. Go to ChatGPT Settings > GPTs > Configure (your GPT or custom instructions)",
        "2. Click 'Add Action'",
        "3. Paste this JSON schema into 'Schema':",
        "[copy the MCP tool schema from mcp/src/schema.js]",
        "4. In 'Authentication', select 'API Key' and paste: [YOUR_KEY]",
        "5. Save and test: 'Find sources on [topic]'"
      ]
    },
    claude: {
      name: "Claude (via Codebase MCP)",
      steps: [
        "1. Install the OpenCITE MCP: add to your MCP config file",
        "2. [installation instructions for Claude Desktop / API]",
        "3. Set env var: OPENCITE_API_KEY=[YOUR_KEY]",
        "4. Restart Claude",
        "5. Try: 'Search for verified sources on [topic]'"
      ]
    },
    gemini: {
      name: "Google Gemini",
      steps: [
        "1. Go to https://gemini.google.com/settings/tools",
        "2. Add custom tool with this schema: [schema]",
        "3. Set authentication header: Authorization: Bearer [YOUR_KEY]",
        "4. Save and test"
      ]
    }
  };
  ```

### 3.5 Paywall response format
- **When:** user hits tier limit OR makes an authenticated call and credits are exhausted
- **Status:** `402` (Payment Required)
- **Body:**
  ```json
  {
    "error": "insufficient_credits",
    "message": "You've used your 20 monthly searches. Upgrade to get more.",
    "credits": {
      "remaining": 0,
      "monthly_limit": 20,
      "plan": "free",
      "reset_date": "2026-06-30"
    },
    "upgrade": {
      "url": "https://opencite.space/plans",
      "options": [
        {
          "name": "Pro",
          "price": "$10/month",
          "credits": 1000,
          "stripe_price_id": "price_xxx"
        },
        {
          "name": "Pack (+100)",
          "price": "$5",
          "credits": 100,
          "stripe_price_id": "price_yyy"
        }
      ]
    }
  }
  ```

### 3.6 Update `/api/search` to enforce the paywall
- **Auth flow (current, per v0.32):**
  1. Check API key in header/query → resolve to user + plan
  2. Apply rate limit (per v0.32)
  3. Pre-authorize credit spend
  4. Execute search
  5. Settle charge (coverage-prorated)
- **New:** if step 3 fails (insufficient credits), return 402 + upgrade options (above)
- **For unauthenticated:** insert trial-quota check before step 1
  - If no key + IP has quota → decrement quota, proceed
  - If no key + IP quota exhausted → return 402 + signup link (different from authenticated paywall)

---

## 4. Data schema

### New table: `ai_connections` (Prisma migration)
```prisma
model AiConnection {
  id              String    @id @default(cuid())
  user_id         String    @db.Uuid
  user            User      @relation(fields: [user_id], references: [internal_id], onDelete: Cascade)
  connected_model String    -- 'chatgpt' | 'claude' | 'gemini'
  api_key_id      String    @db.Uuid
  api_key         ApiKey    @relation(fields: [api_key_id], references: [id], onDelete: Cascade)
  connected_at    DateTime  @default(now())
  last_used_at    DateTime?

  @@unique([user_id, connected_model])
  @@index([user_id])
}
```

### Update `User` model (optional)
- Add relation: `ai_connections AiConnection[]`

### Trial quota cache (in-memory, no schema)
- Node.js `Map` or `node-cache` module
- Reset logic: cron job or lazy check on each request
- **Fallback if cache is lost:** all IPs reset (mild UX impact, no data loss)

---

## 5. Implementation breakdown & effort

| Component | Scope | Effort | Dependencies |
|---|---|---|---|
| Per-IP trial middleware | Quota tracking, reset, decrement | 45 min | none |
| `AIConnectionSelector.jsx` | Reusable component, 3 AI cards, required/optional modes | 1 hr | UI framework (Vite/React) |
| `/auth/connect-ai` page | Wrapper, forced flow, OAuth callback integration | 30 min | AIConnectionSelector |
| `/settings/connect-ai` page | Wrapper, optional flow, Settings integration, manage connections | 45 min | AIConnectionSelector, existing Settings layout |
| `POST /api/auth/connect-ai` | Session validation, key generation, ai_connections upsert | 45 min | v0.30 key system |
| `POST /api/keys/generate` | Random key gen, hash, insert, return unhashed | 30 min | v0.30 api_keys table |
| Settings card (API & Integrations) | New card in Settings, link to `/settings/connect-ai` | 30 min | existing Settings |
| AI setup instructions | Config file + responsive display in UI | 30 min | none |
| Paywall response (402) | Format, upsell options, link to /plans | 30 min | v0.30 Plans UI |
| Update `/api/search` | Trial quota check, 402 handling, response enrichment | 1 hr | v0.32 auth + identity |
| `ai_connections` migration | Prisma + SQL, idempotent | 15 min | scripts/migrate.mjs (v0.30) |
| **Total** | | **~6.5 hrs** | v0.30 (Stripe), v0.32 (meter), existing auth |

---

## 6. Build order

1. **Prisma migration** + `ai_connections` table (15 min)
2. **`POST /api/keys/generate`** endpoint (30 min)
3. **`POST /api/auth/connect-ai`** endpoint (45 min)
4. **`AIConnectionSelector.jsx`** (reusable component) (1 hr)
5. **Per-IP trial middleware** in `/api/search` (45 min)
6. **Paywall response format** (30 min)
7. **`/auth/connect-ai` page** (forced, OAuth callback) (30 min)
8. **Settings: "API & Integrations" card** + `/settings/connect-ai` page (45 min)
9. **AI setup instructions config** (30 min)
10. **Integration test**: unauthenticated → trial → signup → key gen → authenticated call (30 min)
11. **Settings test**: logged-in user → Settings → enable AI connection → manage/revoke (30 min)

---

## 7. Open questions (resolve before execution)

- [ ] **Trial quota number:** 5 searches/week, or different cadence? (Recommend 5/week = ~20/mo parity with free tier.)
- [ ] **Trial reset window:** calendar week (Sun–Sat UTC), relative week (7 days from first use)? (Recommend UTC week.)
- [ ] **External discovery forced flow:** require AI selection at `/auth/connect-ai` or allow "set up later"? (Recommend "set up later" button; users can enable in Settings anytime.)
- [ ] **Multiple AI connections per user:** allow linking to ChatGPT *and* Claude *and* Gemini with the same account? (Recommend yes — one user, many AIs; separate API keys per connection.)
- [ ] **API key format & length:** `sb_pk_XXXXXXXXXXXXXXXXXXXXXXXXXX` (current, 40+ chars)? Or shorter? (Current is fine; matches industry standard.)
- [ ] **Cache backend:** in-memory Node `Map` (MVP), Redis (production), or simple DB table? (Recommend in-memory `Map` for MVP; no persistence needed, lazy reset on next request.)
- [ ] **Settings card placement:** under "Account", "API & Integrations", or new tab? (Recommend new "API & Integrations" tab alongside API keys / webhooks if future-proofing; otherwise under "Account" if Settings is simple.)

---

## 8. Cross-cutting constraints

- **No origin violations.** Trial quota is per-IP; unauthenticated paywall link is public. Neither reveals adapter sources.
- **Reuse v0.30 + v0.32 identity.** Auth identity + key resolution live; don't duplicate.
- **Paywall response is consistent.** Authenticated (402 for insufficient credits) and unauthenticated (402 for exhausted trial) both return upgrade options with link to `/plans`. Format is identical.
- **Setup instructions are copy-paste.** No dynamic generation per-key; the instructions are static per AI, with a placeholder for the key. UI handles replacement.
- **Idempotent & safe.** Multiple calls to `POST /api/auth/connect-ai?model=chatgpt` don't create duplicate connections; upsert the `ai_connections` row.

---

## 9. Testing checklist (before ship)

### External discovery path (unauthenticated → forced connection)
- [ ] **Unauthenticated trial:** call `/api/search` with no auth → get results + trial footer (remaining quota)
- [ ] **Trial exhaust:** make 5 calls on a new IP → 6th returns 402 + signup link
- [ ] **Trial reset:** wait for weekly reset boundary (or manually advance clock in test) → quota refills
- [ ] **OAuth → forced connection:** sign in → immediately land on `/auth/connect-ai` (not dashboard)
- [ ] **Forced selection:** `/auth/connect-ai` has no skip button, requires AI selection or "set up later"
- [ ] **API key setup:** select Claude → API key displayed + instructions → copy key, paste into Claude MCP config
- [ ] **Authenticated call:** next `/api/search` call includes auth header with key → succeeds
- [ ] **Authenticated paywall:** use 20 free credits → 21st call returns 402 + upgrade options
- [ ] **Purchase → resume:** buy Pro tier from paywall link → webhook grants 1,000 credits → 21st call succeeds

### Settings path (optional, logged-in users)
- [ ] **Settings access:** logged-in user navigates to Settings > "API & Integrations"
- [ ] **Connection card:** "Connect to your AI for one-click sourcing" card is visible + clickable
- [ ] **Settings page:** click "Connect" → route to `/settings/connect-ai`
- [ ] **Optional selection:** `/settings/connect-ai` has "Skip for now" button, optional AI selection
- [ ] **Skip flow:** click skip → return to Settings page, no key generated
- [ ] **Select flow:** select Claude → API key generated → instructions displayed
- [ ] **Key management:** Settings shows list of connected AIs + revoke buttons
- [ ] **Revoke:** click revoke on a connected AI → key is disabled, `ai_connections` row marked inactive

### Cross-cutting tests
- [ ] **Multiple connections:** user connects Claude + ChatGPT → both have separate keys, separate `ai_connections` rows
- [ ] **Key isolation:** Claude key works with Claude calls only (not ChatGPT)
- [ ] **Plan enforcement:** Pro tier user connected to Claude has 1,000 credits; free tier has 20 credits; limits enforced per key
- [ ] **Trial → connection → purchase:** unauthenticated user → signup → forced connection → buy Pro → usage meters correctly

---

## 10. Roadmap & sequencing

**v0.37 (this sprint):** Per-IP trial + OAuth AI connection selection + paywall funnel (this document).

**Post-ship:** 
- Monitor conversion rate: unauthenticated → signup → purchase
- Tune trial quota & reset window based on usage patterns
- Add analytics: which AI is most popular? (informs v0.38 UX priorities)
- Dashboard for authenticated users to manage API keys + view usage per key (separate sprint)

---

*End v0.37 plan. Ready for execution approval.*
