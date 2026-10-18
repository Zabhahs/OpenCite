// OpenCITE — verify trial SSOT (v0.48 Phase 2, directive 3b / D-4)
//
// The one path that spends nothing and needs no card: `verify_citations` up to TRIAL.refsPerDay
// references per UTC day per identity. Identity is
//   user:<id>  when a credential resolved to an account with no entitlement (free plan, empty
//              balance) — this is every Claude.ai connector user, whose calls arrive from
//              Anthropic's cloud IPs, so a per-IP counter would be shared by all of them;
//   ip:<addr>  for keyless REST / stdio calls.
// The counter lives in Postgres (trial_usage), not KV: durable, shared across instances, and
// not bypassable by a cold start. ONE atomic upsert claims the references or refuses them.
// Every other endpoint stays 401/402 — the trial is verify-only by design (no free search).

import { prisma } from "./prisma.js";
import { TRIAL } from "./plans.js";

export const trialIdentity = ({ userId, ip }) => (userId ? `user:${userId}` : `ip:${ip || "anon"}`);

const todayUtc = () => new Date().toISOString().slice(0, 10);
const resetsAt = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.toISOString(); };

/**
 * claimTrial(identity, refs) → { ok, used, remaining, resets_at }
 * Atomically adds `refs` to today's counter if the total stays ≤ TRIAL.refsPerDay; otherwise
 * refuses without changing anything. Never throws (a DB failure refuses the trial — fail closed,
 * because the trial is the one unmetered spend path).
 */
export async function claimTrial(identity, refs) {
  const n = Math.max(1, Math.floor(Number(refs) || 1));
  const day = todayUtc();
  try {
    const rows = await prisma.$queryRaw`
      INSERT INTO "trial_usage" ("identity", "day", "refs", "updated_at")
      VALUES (${identity}, ${day}::date, ${n}, now())
      ON CONFLICT ("identity", "day") DO UPDATE
        SET "refs" = "trial_usage"."refs" + EXCLUDED."refs", "updated_at" = now()
        WHERE "trial_usage"."refs" + EXCLUDED."refs" <= ${TRIAL.refsPerDay}
      RETURNING "refs"`;
    if (!rows.length) {
      const cur = await prisma.$queryRaw`SELECT "refs" FROM "trial_usage" WHERE "identity" = ${identity} AND "day" = ${day}::date`;
      const used = Number(cur[0]?.refs ?? TRIAL.refsPerDay);
      return { ok: false, used, remaining: Math.max(0, TRIAL.refsPerDay - used), resets_at: resetsAt() };
    }
    const used = Number(rows[0].refs);
    return { ok: true, used, remaining: Math.max(0, TRIAL.refsPerDay - used), resets_at: resetsAt() };
  } catch {
    return { ok: false, used: null, remaining: 0, resets_at: resetsAt(), unavailable: true };
  }
}

// Response meta block for a trial-served answer.
export const trialMeta = (claim) => ({
  trial: true,
  remaining: claim.remaining,
  resets_at: claim.resets_at,
  subscribe_url: "https://citation.today/#developers",
});

// 402 body when the daily trial is used up (built here, beside the policy it enforces).
export const trialExhausted = (claim) => ({
  error: `Daily free verification limit reached (${TRIAL.refsPerDay} references/day).`,
  code: "trial_exhausted",
  remaining: 0,
  resets_at: claim.resets_at,
  subscribe_url: "https://citation.today/#developers",
  docs_url: "https://citation.today/docs/",
});
