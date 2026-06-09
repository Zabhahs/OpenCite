---
machine_ids: [contexts.AuthContext, contexts.BillingContext, contexts.SettingsContext]
findings: [F-300, F-308, F-311]
runtime: client
status: mixed
tags: [context, auth, billing, settings, stub]
---

# Contexts

> **Three React contexts** — only `AuthContext` is live and in the provider tree. `BillingContext` is an inert stub never mounted. `SettingsContext` wraps `useSettings` but is also never mounted.

---

## `AuthContext` (`src/contexts/AuthContext.jsx`)

**Status: LIVE**

Provides: `{ user, status, signIn, signOut }`.

- `user`: `null` or `{ id, name, email, image }` — shape from Auth.js v5 session.
- `status`: `"loading" | "authenticated" | "unauthenticated"`.
- `signIn(provider)`: delegates to `src/lib/auth-client.js` (not this agent's scope).
- `signOut()`: delegates to `src/lib/auth-client.js`.

**Provider:** `AuthProvider` is mounted in `App.jsx:464` — the outermost wrapper of the full tree. It calls `getSession()` once on mount via `useEffect`; sets `user` + `status` from the resolved session.

**Cancellation:** uses a `cancelled` flag to discard the `getSession()` response if the component unmounts before resolution (correct async pattern).

**Phase 4 hook:** Comment at lines 43–47 marks where SIWE / Base L2 wallet auth will be added. Both OIDC and SIWE sessions will resolve to the same `user.id` (internal UUID).

**Consumers:** `useSettings`, `useLibrary`, `useHistory` (all read `user` from `useAuth()`). `App.jsx` reads `status` and `user`. `AdminConsole.jsx`, `Layout.AuthButton` also call `useAuth()`.

---

## `BillingContext` (`src/contexts/BillingContext.jsx`)

**Status: STUB — never mounted**

The file exists and exports `BillingProvider` + `useBilling`, but `BillingProvider` is never imported or mounted anywhere in the app tree (`src/App.jsx:462–470` and `main.jsx` confirm this).

The stub value: `{ credits: Infinity, tier: "free", deduct: () => Promise.resolve(true) }`.

All searches pass without any credit check client-side. The real credit metering lives on the server side (`api/_shared/billing.js`, `api/search.js` middleware) — see [[05-Billing/Billing-Credits]] and [[04-Backend-API/Search-Endpoint]].

**Phase roadmap (per file comments):**
- Phase 2 (Rate Limiting): real Vercel KV leaky-bucket credit balance.
- Phase 3 (Stripe): tier from Stripe subscription status.
- Phase 4 (Agent billing): Base L2 micropayment for agent actors.

**Finding F-300:** The `BillingProvider` being unmounted is not a bug (the server gates it), but it means client UI cannot react to credit exhaustion without a future wire-up. The `deduct()` no-op masks any client-gated UX (e.g., showing "you've used X of 20 searches" to free users).

---

## `SettingsContext` (`src/contexts/SettingsContext.jsx`)

**Status: DEAD — never mounted, never consumed**

A thin wrapper context that calls `useSettings()` and provides the result. Exports `SettingsProvider` and `useSettingsContext`. Neither is imported anywhere in the live app.

All settings consumers call `useSettings()` directly:
- `App.jsx` calls `useSettings()` and prop-drills `settings`, `save`, `isEnabled`, `toggleAdapter` down to `SettingsPanel`, `SearchControls`, `useSearch`.

**Finding F-308:** This is pure dead code. If prop-drilling becomes burdensome (e.g. when adding new settings consumers), `SettingsProvider` should be mounted in `App.jsx` wrapping `OpenCITE` or placed in the `AuthProvider` tree, and all consumers switched to `useSettingsContext()`. Until then, the file should be removed or its dead status documented.

---

## Context gap: no ErrorContext / no CreditContext

There is no client-visible credit balance display, no error boundary context, and no toast/notification system. All error states are either per-component local state (useSearch stores per-adapter errors in sectionStates) or silent (syncFromDB catches and ignores network failures silently).

---

## 🩺 Health audit

- **Verdict:** mixed — AuthContext is healthy and live; BillingContext and SettingsContext are dead weight.
- **Findings:** [F-300] BillingProvider never mounted (see [[09-Audit/Bugs#f-300]]). [F-308] SettingsContext/SettingsProvider never mounted or consumed (see [[09-Audit/Bugs#f-308]]). [F-311] No client-visible credit balance — users cannot see how many searches they have left; the server gates but the UI is silent.
- **Fix F-300:** Mount `BillingProvider` inside `AuthProvider` once Phase 2 ships. Wire it to a real credit-balance API call. Expose a `useBilling()` hook to the credit meter display.
- **Fix F-308:** Either delete `SettingsContext.jsx`, or mount `SettingsProvider` and migrate `useSettings()` call sites to `useSettingsContext()` — reducing prop-drilling from App.jsx.

## See also

[[01-Frontend/Hooks]] · [[01-Frontend/App-Shell]] · [[01-Frontend/State-Flow]] · [[05-Billing/Billing-Credits]] · [[09-Audit/Bugs]]
