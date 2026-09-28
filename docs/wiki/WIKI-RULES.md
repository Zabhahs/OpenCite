---
tags: [policy, meta]
---

# Wiki Content Rules

Binding policy for every page under `docs/wiki/` (machine layer excluded — its contract is
[[_machine/schema|schema.md]]). Adopted v0.44 (`sprint_log_v0_44.md` §Wiki content rules) after the
2026-06-09 audit found the wiki documenting unmerged branches, deleted code, and counts that had
rotted within one sprint. A page that violates these rules gets fixed or deleted — not annotated.

## The rules

**1. Document merged `main` only.**
Branch or planned behavior reads as shipped behavior; that fiction is how v0.35 poisoned the ledger.
- Violates: "RRF fusion combines native and BM25F rankings" (lived only on a dead branch).
- Conforms: "Results are interleaved in native upstream order (since v0.44)."

**2. A page states purpose, contract, invariants — never narrates implementation.**
The source is the walkthrough; prose copies of code are stale the day after they're written. Link the file.
- Violates: "The handler first calls `parseBody`, then loops over adapters, then…"
- Conforms: "Contract: POST body ≤ 64 KB, parsed by the shared `parseBody`. See `api/_shared/parseBody.js`."

**3. No facts that rot: no line numbers, no counts, no export tables, no quoted code blocks.**
These are correct for exactly one commit; nobody updates them.
- Violates: "29 adapters are registered at `index.js` lines 12–48; `useSearch` exports 6 symbols."
- Conforms: "Adapters self-register in `src/adapters/index.js` — the registry is the count."

**4. One fact, one home.**
Statuses live in the findings ledger; narrative lives in the sprint log; pages link, never copy. Copies fork and disagree.
- Violates: a page-local "open findings" list restating ledger statuses.
- Conforms: "Findings: see [[09-Audit/Bugs]] (F-405, F-407)."

**5. Point-in-time data (probes, dossiers) is evidence, dated — not living truth.**
A probe result is true about a moment; undated it masquerades as a current guarantee.
- Violates: "BDH is down."
- Conforms: "BDH returned HTTP 403 when live-probed 2026-06-09; quarantined v0.44."

**6. A verification claim must cite the command and commit it was run against.**
"Verified" without provenance is unfalsifiable and unrepeatable.
- Violates: "Confirmed working in prod."
- Conforms: "Verified `curl https://…/api/search?q=test` against `33b8b05`, 2026-06-09."

**7. Delete, don't archive — git history is the archive.**
Archive directories become a second, rotting wiki that grep still finds. `_quarantine/` (removed-but-recoverable code) and dated evidence are the only sanctioned exceptions.
- Violates: moving a superseded page to `99-Archive/`.
- Conforms: `git rm` the page; the sprint log records why; `git log` recovers it.

**8. If a page would be stale after one sprint, it shouldn't exist.**
Volatile facts belong in the ledger, the sprint log, or the code — not in a page nobody re-edits.
- Violates: a hand-maintained dashboard of per-module health counts.
- Conforms: a page of durable contracts plus links to the ledger.

## Page template

```markdown
---
machine_ids: [<module ids>]
tags: [<area>]
---

# <Page Title>

**Purpose** — one paragraph: what this subsystem is for and why it exists.

## Contract
What callers may rely on: inputs, outputs, error behavior. Link source files; no code blocks.

## Invariants
The properties that must survive refactors (the things a reviewer checks).

## Links
Source files · related pages · findings ledger entries · the sprint log that last changed this.
```
