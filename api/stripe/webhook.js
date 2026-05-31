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
//                                              (tier change); downgrade when inactive.
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
import { getPack, getPlan, monthlyGrantFor, planIdForPriceId } from "../_shared/plans.js";
import { applyMonthlyGrant } from "../_shared/billing.js";
import { log } from "../_shared/log.js";

const dec = (n) => new Prisma.Decimal(n);

// Event groups (kept here so the handler reads declaratively).
const RENEWAL_EVENTS = new Set(["invoice.paid", "invoice.payment_succeeded"]);

// Calendar-month key (UTC) for monthly-grant idempotency.
const periodOf = (d = new Date()) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

// Pull the subscription Price id off an invoice line (shape varies by API version).
function priceIdFromInvoice(inv) {
  const line = inv?.lines?.data?.find((l) => l?.price?.id || l?.plan?.id) || inv?.lines?.data?.[0];
  return line?.price?.id || line?.plan?.id || null;
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

  try {
    // Claim + side effects in ONE transaction: the unique PK on processed_events
    // dedupes (P2002 = already handled), and any failure rolls back the claim so a
    // Stripe retry re-applies it. Concurrent duplicates collide on the PK — one wins.
    const result = await prisma.$transaction(async (tx) => {
      await tx.processedEvent.create({ data: { event_id: event.id, type: event.type } });

      if (event.type === "checkout.session.completed" && userId) {
        if (obj.customer) {
          await tx.user.update({ where: { id: userId }, data: { stripe_customer_id: String(obj.customer) } });
        }
        const pack = getPack(obj.metadata?.pack);
        if (pack) {
          await tx.user.update({ where: { id: userId }, data: { total_credits: { increment: dec(pack.credits) } } });
        }
        const planId = obj.metadata?.plan;
        if (planId && getPlan(planId).subscription) {
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
        if (active && mapped) data.plan = mapped;
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

      return { kind: "ack" };
    });

    log("stripe", result.kind, { userId, ...result });
    return res.status(200).json({ received: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Event already processed (claim collided) — acknowledge, don't re-apply.
      return res.status(200).json({ received: true, duplicate: true });
    }
    log.err("stripe", "handler-error", { type: event?.type, msg: err.message });
    // 500 → Stripe retries; the rolled-back claim makes retries safe.
    return res.status(500).json({ error: "Webhook handler error" });
  }
}
