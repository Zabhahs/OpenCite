---
machine_ids: [api.user.quiz, api.shared.mailer, api.shared.quizToken, db.quiz_responses, db.users.quiz_sent_at, cron.quizSweep, page.feedback]
runtime: node
status: planned
tags: [sprint, email, resend, feedback, onboarding, growth]
---

# Sprint v0.51 — Day-7 feedback quiz email (Resend + 5-question quiz)

**Date:** 2026-10-17 · **Baseline:** `main` @ `48935a0` + uncommitted v0.48-P2 / v0.50 trees · **Status:** PLANNED, awaiting GO from Shahbaz. Nothing built, nothing sent.

## 0. Why

Prod audit (2026-10-17): 14 users, about 9 external, all organic (nothing promoted in June–September), and **no record of how any of them arrived** (Vercel Web Analytics returns "not found" for the project; no GA in the repo). We need a way to learn, per new sign-up, how they found OpenCITE and what they liked. One automated, one-time email on day 7 replaces manual outreach for every future sign-up. The 9 existing users get the manual email already drafted (§8).

## 1. What exists today (verified)

| Fact | Where | Consequence |
|---|---|---|
| No email provider anywhere in the repo. Auth is Google-only. | grep of `api/`, `src/`, `package.json` for resend/nodemailer/sendgrid/smtp → none | New shared module `api/_shared/mailer.js`; Shahbaz creates the Resend account. |
| Daily crons already in use. | `vercel.json:25` (`/api/health` 06:00, `/api/billing-sweep` 05:00) | Hobby allows daily crons — fine for "7 days after signup". |
| Vercel Hobby: 12 Node functions, at the cap. `api/user/[resource].js` dispatches by path segment; `vercel.json` rewrites `/api/<r>` → `/api/user/<r>`. | `api/user/[resource].js`, `vercel.json:7–12` | Quiz endpoints + the sweep are **handlers inside the existing dispatcher**. Zero new functions. A cron `path` can point at the rewritten route. |
| `users."createdAt"` and `users.email` exist; `plan`, `settings` too. No `quiz_sent_at`, no opt-out flag. | live `information_schema` 2026-10-17 | One additive migration. |
| Seeded non-human row `admin-test@opencite.internal` (`plan='admin'`). | v0.32 sprint log | Sweep must exclude `*.internal` and `plan='admin'`. |

## 2. Design

### 2.1 What "email-embedded quiz" can honestly mean

Email clients do not run forms or scripts (AMP-for-email is Gmail-only and needs sender registration, so no). Link-scanners also **prefetch GET links**, so a tap that writes an answer directly would record phantom answers.

Chosen shape:
- **Question 1 is inline in the email** as 4–5 tappable answer buttons ("How did you find OpenCITE?"). Each button is a signed link to the feedback page with that answer **pre-selected** — nothing is recorded on the GET.
- **Questions 2–5 sit on the same page**, one scroll, no pagination, about 60 seconds. The user presses one **Submit** (POST) and the whole quiz is recorded.

Net: one tap from the inbox lands on a page where Q1 is already answered.

### 2.2 The five questions

| # | Question | Type | Where |
|---|---|---|---|
| 1 | How did you find OpenCITE? | Single choice: Web search · AI assistant (ChatGPT/Claude/Gemini) · GitHub / npm · A friend or colleague · Social / forum · Other (text) | Email buttons + page |
| 2 | What was your favorite thing you found using the site? | Free text (optional) | Page |
| 3 | What were you trying to do? | Multi-choice: Literature review · Verify a citation · Find a specific paper · Find open-access full text · Explore a topic · Other | Page |
| 4 | What was frustrating or missing? | Free text (optional) | Page |
| 5 | How likely are you to recommend OpenCITE to a colleague? | 0–10 | Page |

Only Q1 and Q5 are required. Everything else is skippable, to keep the completion rate up.

### 2.3 Data model (one additive, idempotent migration)

```sql
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "quiz_sent_at"   TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_opt_out"  BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "quiz_responses" (
  "id"            SERIAL PRIMARY KEY,
  "user_id"       UUID NOT NULL REFERENCES "users"("internal_id") ON DELETE CASCADE,
  "quiz"          TEXT NOT NULL DEFAULT 'day7_v1',
  "found_via"     TEXT,        -- Q1
  "found_via_text" TEXT,
  "favorite"      TEXT,        -- Q2
  "intent"        TEXT[],      -- Q3
  "friction"      TEXT,        -- Q4
  "nps"           SMALLINT CHECK ("nps" BETWEEN 0 AND 10),   -- Q5
  "submitted_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "quiz")   -- one response per user per quiz version
);
```

Also add both columns/tables to `prisma/schema.prisma` in the same change. (Do NOT hand-edit generated files.)

### 2.4 Modules (single-responsibility, importable)

| Module | Responsibility |
|---|---|
| `api/_shared/mailer.js` | `sendMail({to, subject, html, text, headers})` over Resend's REST API (`fetch`, no SDK, no new dependency). Fail-open: returns `{ok:false}`, never throws. Adds `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Reusable by any later email (receipts, alerts). |
| `api/_shared/quizToken.js` | `sign({uid, quiz, exp})` / `verify(token)` — HMAC-SHA256 over a compact payload, keyed by `QUIZ_TOKEN_SECRET` (≥32 chars, throws at load if unset, same contract as `AUTH_SECRET`). Also signs the unsubscribe link. Constant-time compare. |
| `api/_shared/quizEmail.js` | Pure template: `renderQuizEmail({name, q1Links, unsubUrl}) → {subject, html, text}`. No I/O, unit-testable. |
| `api/user/[resource].js` (+ cases) | `quiz-sweep` (cron, `CRON_SECRET`-authed), `quiz` (GET: verify token → return questions + preselection; POST: verify + insert), `unsubscribe` (POST one-click + GET confirm page). |
| `src/pages/Feedback.jsx` (hash route `#/feedback?t=…`) | Renders the five questions; reads the token; POSTs once. Thank-you state. |

### 2.5 The sweep (cron `0 15 * * *`, path `/api/user/quiz-sweep`)

Eligibility, evaluated in SQL:

```sql
"createdAt" <= now() - interval '7 days'
AND "createdAt" >  now() - interval '14 days'   -- never mass-mail old accounts on first run
AND quiz_sent_at IS NULL AND email_opt_out = false
AND email NOT LIKE '%.internal' AND plan <> 'admin'
```

Safety rules, in order:
1. **Claim, then send.** `UPDATE users SET quiz_sent_at = now() WHERE internal_id = $1 AND quiz_sent_at IS NULL RETURNING …` — only the invocation that wins the row sends. A retried or overlapping cron cannot double-send.
2. If Resend fails, reset `quiz_sent_at = NULL` so tomorrow retries; after 3 failed days the 14-day window closes it out.
3. Hard cap **20 mails per run**; log counts only (no addresses in logs).
4. `QUIZ_EMAIL_ENABLED=1` env gate, **default off**, so deploying the code sends nothing until Shahbaz flips it.

### 2.6 Compliance (several users are likely EU-based)

- Single, non-commercial, relationship-based message; plain sender identity ("Shahbaz from OpenCITE") from a domain we control.
- One-click unsubscribe (header + visible link) that sets `email_opt_out`; honoured instantly.
- Privacy page gains one paragraph: we email once, 7 days after sign-up, to ask for feedback; stored responses are tied to your account; you can opt out or ask for deletion (`ON DELETE CASCADE` covers account deletion).
- No tracking pixels, no link-rewriting.

## 3. Tasks

| ID | Task | Owner | Notes |
|---|---|---|---|
| T0 | Create the Resend account; verify the sending domain (SPF, DKIM, DMARC DNS records); create an API key | **Shahbaz** | I can't create accounts. Send from `feedback@<domain>`; start with `onboarding@resend.dev` for the test only. |
| T1 | Add Vercel env vars (Production): `RESEND_API_KEY`, `MAIL_FROM`, `QUIZ_TOKEN_SECRET` (≥32 chars), `CRON_SECRET`, `QUIZ_EMAIL_ENABLED=0` | Shahbaz (or me via CLI on request) | Never in the repo. Add names to `.env.example`. |
| T2 | Migration + `schema.prisma` (§2.3) | Claude | Additive; `IF NOT EXISTS`. |
| T3 | `mailer.js`, `quizToken.js`, `quizEmail.js` (§2.4) | Claude | Pure/isolated; no new npm deps. |
| T4 | Dispatcher cases `quiz`, `quiz-sweep`, `unsubscribe` + `vercel.json` rewrites + cron entry | Claude | Verify function count stays at the cap after the change. |
| T5 | `Feedback.jsx` page + route | Claude | Preselects Q1 from the token; single POST. |
| T6 | Privacy copy (`public/legal/privacy.html`) | Claude | One paragraph. |
| T7 | Admin read view: counts for Q1 and mean NPS in the admin console, plus raw free-text list | Claude | Optional; a SQL query on `quiz_responses` is enough at this volume. |
| T8 | Backfill: the manual email to the existing ~9 users (draft already approved in chat) | Shahbaz sends | Not automated by design (§2.5 window). |

## 4. Verification (prod only — no local builds/tests per `CLAUDE.md`)

1. Deploy with `QUIZ_EMAIL_ENABLED=0`; confirm `/api/user/quiz-sweep` returns 401 without `CRON_SECRET` and `{sent:0,disabled:true}` with it.
2. Temporarily set one **test user row's** `createdAt` back 8 days (a user Shahbaz owns, e.g. his own second account), flip `QUIZ_EMAIL_ENABLED=1`, trigger the sweep once, confirm: exactly one mail to Shahbaz, `quiz_sent_at` set, second trigger sends nothing.
3. Open the mail in Gmail: Q1 buttons render, tapping lands on `#/feedback` with the answer preselected, Submit writes one `quiz_responses` row, re-submit is rejected (UNIQUE).
4. Unsubscribe link: sets `email_opt_out=true`; a re-run skips the user.
5. Send-to-self check of spam placement (Gmail "Show original": SPF/DKIM/DMARC all PASS).
6. Restore the test row's `createdAt`; leave `QUIZ_EMAIL_ENABLED=1` only after all five pass.

## 5. Risks

| Risk | Mitigation |
|---|---|
| Link-scanners prefetch GET links and record phantom answers | Nothing is recorded on GET; only the POST on Submit writes (§2.1). |
| Double-send from cron retry/overlap | Claim-then-send `UPDATE … WHERE quiz_sent_at IS NULL` (§2.5). |
| Unverified sending domain → spam folder | T0 DNS records verified before `QUIZ_EMAIL_ENABLED=1`; step 5 above. |
| Hits the 12-function cap | Everything lives in the existing dispatcher (§1). Verified again at T4. |
| Free-text answers contain personal data | Only the admin can read them; deleted with the account; privacy copy covers it. |
| Low volume (about 1 sign-up/month) → few responses | Expected. The value is per-user attribution; the manual batch (T8) covers existing users. |

## 6. Out of scope

Marketing or drip sequences; re-sending to non-responders; AMP-for-email; open/click tracking; emailing existing users automatically.

## 7. Open decisions for Shahbaz

1. **Sending domain / From address.** Which domain (`citation.today`?) and name?
2. **Send time.** Daily at 15:00 UTC is the default; change if wanted.
3. **Quiz wording.** Are the five questions in §2.2 right, or do you want to swap any?
4. **Incentive.** Optionally grant a few bonus credits on submit (it would raise the response rate, but it needs a credit-ledger write). Default: none.
5. **Admin read view (T7).** Build it, or just use SQL?

## 8. Effort

About 3–4 hours of code, plus the Resend/DNS setup time on your side (T0). No new infrastructure, no new npm packages, no new serverless functions.
