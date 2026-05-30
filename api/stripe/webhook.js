// OpenCITE — Stripe webhook
// Route: /api/stripe/webhook
// Runtime: Node.js (raw body required for signature verification)
//
// Verifies the Stripe signature against the RAW body, then acts on:
//   - checkout.session.completed  → grant credits (PAYG pack) and/or set the user's
//                                    subscription plan; persist stripe ids.
//   - customer.subscription.deleted/updated → downgrade to free when canceled.
// Idempotent on the Stripe event id (R11) via a durable Postgres unique insert
// (processed_events) — bulletproof even if KV/cache is down.
//
// Dormant until WS3 ships: requires STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET and
// the `stripe` package. The SDK is dynamically imported so its absence can't break
// other routes at build time; an unconfigured webhook returns 503.

import { Prisma } from "@prisma/client";
import { prisma } from "../_shared/prisma.js";
import { getPack, getPlan } from "../_shared/plans.js";
import { log } from "../_shared/log.js";

const dec = (n) => new Prisma.Decimal(n);

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

  // Resolve the affected user up front (read-only).
  const obj = event.data.object;
  const userId =
    event.type === "checkout.session.completed"
      ? await resolveUserId(obj)
      : event.type === "customer.subscription.deleted"
      ? (await prisma.user.findUnique({ where: { stripe_customer_id: String(obj.customer) }, select: { id: true } }))?.id
      : null;

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

      if (event.type === "customer.subscription.deleted" && userId) {
        await tx.user.update({ where: { id: userId }, data: { plan: "free", stripe_subscription_id: null } });
        return { kind: "unsubscribe" };
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
