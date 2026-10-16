// OpenCITE — Stripe webhook
// Route: /api/stripe/webhook
// Runtime: Node.js (raw body required for signature verification)
//
// Verifies the Stripe signature against the RAW body, then acts on the full event
// set required for this subscription + PAYG model:
//   - checkout.session.completed             → grant credits (PAYG pack) and/or set
//                                              the subscription plan; persist stripe ids.
//   - invoice.paid / invoice.payment_succeeded → subscription renewal: top the monthly
//                                              credit allowance up for the period.
//   - customer.subscription.updated          → re-sync User.plan from the price id
//                                              (tier change, incl. Customer Portal switches —
//                                              an upgrade tops credits up now, v0.47);
//                                              downgrade when inactive.
//   - customer.subscription.deleted          → downgrade to free (cancel).
//   - invoice.payment_failed                 → no credit change; Stripe runs dunning,
//                                              and updated/deleted handle any downgrade.
// Idempotent on the Stripe event id (R11) via a durable Postgres unique insert
// (processed_events) — bulletproof even if KV/cache is down. The monthly grant is
// ALSO idempotent per calendar month (credits_period), so invoice.paid AND
// invoice.payment_succeeded both firing for one renewal can't double-grant.
//
// Dormant until WS3 ships: requires STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET and
// the `stripe` package. The SDK is dynamically imported so its absence can't break
// other routes at build time; an unconfigured webhook returns 503.

import { Prisma } from "@prisma/client";
import { prisma } from "../_shared/prisma.js";
import { getPack, getPlan, monthlyGrantFor, planIdForPriceId, PLANS, CREDIT_PACKS, PACK_BUYER_PLAN_ID } from "../_shared/plans.js";
import { applyMonthlyGrant, applyUpgradeGrant, clawbackCredits } from "../_shared/billing.js";
import { periodOf } from "../_shared/apiAuth.js";
import { log } from "../_shared/log.js";

const dec = (n) => new Prisma.Decimal(n);

// Event groups (kept here so the handler reads declaratively).
const RENEWAL_EVENTS = new Set(["invoice.paid", "invoice.payment_succeeded"]);
// v0.46: a pack is fulfilled on completion only when paid; delayed methods complete later.
const FULFILL_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);
// v0.46: money going back out reverses the pack's credits (clamped at 0 — see clawbackCredits).
const REVERSAL_EVENTS = new Set(["charge.refunded", "charge.dispute.created"]);

// Pull the subscription Price id off an invoice line. v0.46: Stripe API 2025-03-31.basil moved
// the price off `line.price` onto `line.pricing.price_details.price` (a bare id); older webhook
// versions still send `line.price.id` / `line.plan.id`. Read all three.
function priceIdFromInvoice(inv) {
  for (const l of inv?.lines?.data || []) {
    const id = l?.pricing?.price_details?.price || l?.price?.id || l?.plan?.id;
    if (id) return id;
  }
  return null;
}

// v0.46: only the processed_events PK collision means "already handled". The same transaction
// also writes the unique stripe_customer_id / stripe_subscription_id columns; a P2002 on THOSE
// must surface as a 500 so Stripe retries and the collision reaches the logs.
const isDuplicateClaim = (err) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" &&
  (Array.isArray(err.meta?.target)
    ? err.meta.target.includes("event_id")
    : String(err.meta?.target ?? "").includes("event_id"));

// v0.47: when a user moves to a plan with a LARGER monthly allowance (new subscription, or a
// Customer Portal upgrade), top the balance up to it now instead of next month. Reads the stored
// plan BEFORE the caller writes the new one; a same-or-smaller allowance (renewal re-sync,
// downgrade) is a no-op, so replays and duplicate events can't re-grant.
async function grantOnUpgrade(tx, userId, newPlanId) {
  const u = await tx.user.findUnique({ where: { id: userId }, select: { plan: true } });
  const grant = monthlyGrantFor({ plan: newPlanId });
  if (grant > monthlyGrantFor({ plan: u?.plan })) {
    await applyUpgradeGrant(userId, grant, periodOf(), { client: tx });
  }
}

// Pull the Price id off a subscription's first item.
function priceIdFromSubscription(sub) {
  return sub?.items?.data?.[0]?.price?.id || null;
}

// Vercel must NOT parse the body — Stripe needs the exact raw bytes.
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function resolveUserId(obj) {
  if (obj.client_reference_id) return obj.client_reference_id;
  if (obj.customer) {
    const u = await prisma.user.findUnique({
      where: { stripe_customer_id: String(obj.customer) },
      select: { id: true },
    });
    if (u) return u.id;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) return res.status(503).json({ error: "Billing not configured" });

  let Stripe;
  try {
    ({ default: Stripe } = await import("stripe"));
  } catch {
    return res.status(503).json({ error: "Billing dependency unavailable" });
  }
  const stripe = new Stripe(secretKey);

  const raw = await readRawBody(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (err) {
    log.warn("stripe", "bad-signature", { msg: err.message });
    return res.status(400).json({ error: "Invalid signature" });
  }

  // Resolve the affected user up front (read-only). Every event we act on carries
  // either client_reference_id (checkout) or a customer id (invoices, subscriptions).
  const obj = event.data.object;
  const userId = await resolveUserId(obj);

  // F-416: a credit/plan event with no resolvable user is silently no-op'd below (correct
  // — don't crash, don't guess a userId). Surface it so a lost client_reference_id /
  // unmapped customer (e.g. a manually-created Stripe customer) is visible in the logs.
  if (!userId && event.type !== "invoice.payment_failed") {
    log.warn("stripe", "unresolved-user", {
      type: event.type,
      eventId: event.id,
      customer: typeof obj.customer === "string" ? obj.customer : null,
    });
  }

  try {
    // Claim + side effects in ONE transaction: the unique PK on processed_events
    // dedupes (P2002 = already handled), and any failure rolls back the claim so a
    // Stripe retry re-applies it. Concurrent duplicates collide on the PK — one wins.
    const result = await prisma.$transaction(async (tx) => {
      await tx.processedEvent.create({ data: { event_id: event.id, type: event.type } });

      if (FULFILL_EVENTS.has(event.type) && userId) {
        // v0.46: fulfil only PAID sessions. A `completed` session with payment_status "unpaid"
        // (delayed payment method) is fulfilled later by async_payment_succeeded; "no_payment_required"
        // covers 100%-off promo codes.
        if (obj.payment_status && !["paid", "no_payment_required"].includes(obj.payment_status)) {
          return { kind: "checkout-unpaid", payment_status: obj.payment_status };
        }
        if (obj.customer) {
          // Only claim the customer id if the row has none yet (a second concurrent checkout could
          // otherwise collide on the unique column and, pre-v0.46, be swallowed as a duplicate).
          await tx.user.updateMany({
            where: { id: userId, stripe_customer_id: null },
            data: { stripe_customer_id: String(obj.customer) },
          });
        }
        // F-417: defence-in-depth — getPack/getPlan already fall back safely on unknown
        // inputs, but validate metadata explicitly and log anomalies. A compromised Stripe
        // secret could otherwise mint a checkout with metadata.plan="pro" to self-grant a
        // tier. The Stripe signature is the real boundary; this is the second line.
        const rawPack = obj.metadata?.pack;
        const rawPlan = obj.metadata?.plan;
        if (rawPack && !CREDIT_PACKS[rawPack]) log.warn("stripe", "unknown-pack-metadata", { rawPack, eventId: event.id });
        if (rawPlan && !PLANS[rawPlan]) log.warn("stripe", "unknown-plan-metadata", { rawPlan, eventId: event.id });

        const pack = rawPack && CREDIT_PACKS[rawPack] ? getPack(rawPack) : null;
        if (pack) {
          await tx.user.update({ where: { id: userId }, data: { total_credits: { increment: dec(pack.credits) } } });
          // v0.46: a pack buyer on the free tier moves to the machine plan (full server-safe set,
          // machine burst cap). Never downgrades a subscriber or admin — free rows only.
          await tx.user.updateMany({ where: { id: userId, plan: "free" }, data: { plan: PACK_BUYER_PLAN_ID } });
        }
        const planId = rawPlan && PLANS[rawPlan] ? rawPlan : null;
        if (planId && getPlan(planId).subscription) {
          await grantOnUpgrade(tx, userId, planId);
          await tx.user.update({
            where: { id: userId },
            data: {
              plan: getPlan(planId).id,
              stripe_subscription_id: obj.subscription ? String(obj.subscription) : undefined,
            },
          });
        }
        return { kind: "checkout", pack: pack?.id, plan: planId };
      }

      // Subscription renewal (and the first paid invoice): top up the monthly
      // allowance. Plan is taken from the invoice's Price id (authoritative, and
      // race-free vs. checkout.session.completed which may arrive after) and falls
      // back to the user's stored plan. Idempotent per month via credits_period, so
      // invoice.paid + invoice.payment_succeeded firing together is a single grant.
      if (RENEWAL_EVENTS.has(event.type) && userId) {
        let planId = planIdForPriceId(priceIdFromInvoice(obj));
        if (!planId) {
          const u = await tx.user.findUnique({ where: { id: userId }, select: { plan: true } });
          planId = u?.plan || "free";
        }
        const grant = monthlyGrantFor({ plan: planId });
        const period = periodOf();
        const res = await applyMonthlyGrant(userId, grant, period, { client: tx });
        return { kind: "renewal", plan: planId, period, granted: res.granted };
      }

      // Tier change / status transition. Re-sync the plan from the live Price id when
      // the subscription is in a serving state; otherwise treat it as downgraded.
      if (event.type === "customer.subscription.updated" && userId) {
        const active = ["active", "trialing", "past_due"].includes(obj.status);
        const mapped = planIdForPriceId(priceIdFromSubscription(obj));
        const data = {};
        if (active && mapped) {
          data.plan = mapped;
          await grantOnUpgrade(tx, userId, mapped); // v0.47: portal Student → Pro switch
        }
        if (!active) {
          data.plan = "free";
          data.stripe_subscription_id = null;
        }
        if (Object.keys(data).length) await tx.user.update({ where: { id: userId }, data });
        return { kind: "sub-updated", status: obj.status, plan: data.plan };
      }

      if (event.type === "customer.subscription.deleted" && userId) {
        await tx.user.update({ where: { id: userId }, data: { plan: "free", stripe_subscription_id: null } });
        return { kind: "unsubscribe" };
      }

      // Failed renewal charge: no credit change. Stripe's dunning retries the invoice;
      // a terminal failure flips the subscription, which arrives as updated/deleted.
      if (event.type === "invoice.payment_failed") {
        return { kind: "payment-failed" };
      }

      // v0.46: refund / dispute on a pack → take the pack's credits back (clamped at 0). The pack
      // id travels on the PaymentIntent metadata (checkout.js sets payment_intent_data.metadata);
      // a dispute object carries it via `payment_intent` → we look it up with the SDK. Subscription
      // charges (no pack) are left to Stripe's own subscription lifecycle events.
      if (REVERSAL_EVENTS.has(event.type)) {
        let meta = obj.metadata || {};
        if (!meta.pack && obj.payment_intent) {
          try {
            const pi = await stripe.paymentIntents.retrieve(String(obj.payment_intent));
            meta = pi.metadata || {};
          } catch (e) {
            log.warn("stripe", "reversal-pi-lookup-failed", { eventId: event.id, msg: e.message });
          }
        }
        const pack = meta.pack && CREDIT_PACKS[meta.pack] ? getPack(meta.pack) : null;
        const target = userId || (meta.userId ? String(meta.userId) : null);
        if (pack && target) {
          await clawbackCredits(target, pack.credits, { client: tx });
          log.warn("stripe", "credits-clawed-back", { eventId: event.id, type: event.type, userId: target, pack: pack.id, credits: pack.credits });
          return { kind: "reversal", pack: pack.id, credits: pack.credits };
        }
        log.warn("stripe", "reversal-unmatched", { eventId: event.id, type: event.type, userId: target, meta });
        return { kind: "reversal-unmatched" };
      }

      return { kind: "ack" };
    });

    log("stripe", result.kind, { userId, ...result });
    return res.status(200).json({ received: true });
  } catch (err) {
    if (isDuplicateClaim(err)) {
      // Event already processed (processed_events PK collided) — acknowledge, don't re-apply.
      return res.status(200).json({ received: true, duplicate: true });
    }
    log.err("stripe", "handler-error", { type: event?.type, msg: err.message, target: err?.meta?.target });
    // 500 → Stripe retries; the rolled-back claim makes retries safe.
    return res.status(500).json({ error: "Webhook handler error" });
  }
}
