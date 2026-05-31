# User Profile — Shahbaz Yusuf (baazijan)

## Working style
- Moves fast, expects precise execution. No padding, no filler.
- **Mode C** (plan → approval → execute) for large tasks. **Mode B** (fast path) for small changes.
- Tests on Vercel — does NOT run `npm install` or local builds. Push to git, Vercel deploys.
- Says "push to git" when ready to commit+push. Expects staged, committed, and pushed in one flow.
- Prefers architecture reports as the canonical project reference — updates them each sprint.
- Wants modular, low-overhead solutions. Dislikes bloat.

## Communication preferences
- Concise. Tables over paragraphs when comparing options.
- Presents decisions as options with tradeoffs, waits for pick.
- Will interrupt mid-execution if something is wrong — adapt immediately.
- Reads code fluently — no need to over-explain obvious changes.

## Technical preferences
- React/Vite frontend, Vercel Edge + Node.js serverless, Prisma + Supabase Postgres.
- SSOT discipline: one file owns each concern, documented in arch report.
- Underscore-prefixed fields (`_score`, `_type`) for pipeline-internal data.
- Prefers client-side solutions over adding server dependencies when feasible.
- No stubs — if an API can't be fully implemented, document it instead.
- Free/open-source preference for dependencies and data sources.
