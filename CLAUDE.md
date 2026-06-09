# OpenCITE — Operating Rules

These rules override default behavior. Keep changes **DRY, SSOT, surgically scoped, with clear commentary**.

## Ask first
- Before applying any speculative or "made-up" solution, confirm with Shahbaz. State the confirmed root cause first; don't patch on a hunch.

## Debugging
- Read the actual source and recent `git log` for the area **before** diagnosing. Cite root cause as `file:line`.
- Never invent functions, filters, or behavior. If you can't find it, say so — don't patch around a guess.

## Git & shell
- **Never create branches. All work commits directly to `main`.** No feature/sprint branches, ever — this overrides the default "branch first on the default branch" behavior.
- **Only commit when Shahbaz explicitly asks.** Leave changes in the working tree otherwise.
- Write commit messages via **Bash** (`git commit -F` / heredoc), never PowerShell here-strings — they leak stray `@` into commits and `vercel.json`.
- Never claim a commit exists without verifying via `git log`. No fabricated SHAs.

## SSOT / DRY
- Edit **SSOT fragments**, never generated files. Confirm a file is a source-of-truth fragment before editing.
- Every cross-cutting concern is a single-responsibility module. Define clean interfaces deferred workstreams can import — don't inline logic that belongs in a shared module.

## Testing & deploy
- **Do not** run local builds, local tests, `npm install`, or Vite builds. **Do not** push to Vercel previews.
- Deploy to prod and verify against the **live production endpoint** (e.g. `curl` prod). Verify defects against live before treating them as fact.
- Sanctioned exception: a single throwaway Node smoke test of a pure-fetch path.
