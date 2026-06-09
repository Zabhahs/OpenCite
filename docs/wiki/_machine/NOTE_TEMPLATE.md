---
machine_ids: [<id>, ...]        # module ids this note documents (see _machine/schema.md)
findings: [F-xxx, ...]          # audit findings raised here (omit if none)
runtime: client|server|both|shared|build|infra
status: healthy|degraded|dead|keyed|buggy|mixed
tags: [<tag>, ...]
---

# <Note title>

> **One-line role.** What this module/cluster is, in a sentence. <!-- shown in graph hover -->

## What it is
Dense prose. What exists and **why**. Link siblings with [[Note-Name]] and code as `src/path/file.js:NN`.

## Key exports / surface
| Symbol | Kind | Purpose |
|---|---|---|
| `default` | fn | ... |

## Dependencies
- Imports: [[...]] , [[...]]
- Imported by: [[...]]
(Authoritative edges live in `_machine/graph.json`; this is the human view.)

## Behaviour / data flow
How it actually runs. For UI notes, describe the user-visible behaviour + state it owns.

## 🩺 Health audit
- **Verdict:** healthy | needs-work | fucked — one line.
- **Findings:** [F-xxx] short title → see [[09-Audit/Bugs#f-xxx]]
- **Reuse:** client↔server notes → see [[09-Audit/Duplication-and-Reuse]]
- **Smells:** dead code, overengineering, duplication, naming, missing tests — with `file:line`.

## See also
[[...]] · [[...]]
