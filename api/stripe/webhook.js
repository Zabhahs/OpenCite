// OpenCITE — Stripe webhook
// Route: /api/stripe/webhook
// Runtime: Node.js (raw body required for signature verification)
//
// Verifies the Stripe signature against the RAW request body, then grants credits
// on a completed checkout. Idempotent on the Stripe event id (R11) via
// billing.grantCredits → KV claimOnce, so retried/duplicated webhooks grant once.
//
// Dormant until WS3 ships: requires STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET and
// the `stripe` package. The SDK is dynamically imported so its absence can't break
// other routes at build time; an unconfigured webhook returns 503.

import { prisma } from "../_shared/prisma.js";
import { grantCredits } from "../_shared/billing.js";
import { log } from "../_shared/log.js";

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

// Resolve a checkout/session object to our User: client_reference_id is the
// authoritative link (set at checkout creation = User.id); customer id is fallback.
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
    // Never echo the body or signature — just a generic 400.
    log.warn("stripe", "bad-signature", { msg: err.message });
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = await resolveUserId(session);
      // Credits purchased — passed through checkout metadata at creation time.
      const credits = Number(session.metadata?.credits);

      // Persist the Stripe customer id on first purchase (idempotent set).
      if (userId && session.customer) {
        await prisma.user.update({
          where: { id: userId },
          data: { stripe_customer_id: String(session.customer) },
        }).catch(() => {});
      }

      if (userId && credits > 0) {
        const result = await grantCredits(userId, credits, event.id);
        log("stripe", "grant", { userId, credits, granted: result.granted, duplicate: !!result.duplicate });
      } else {
        log.warn("stripe", "grant-skipped", { hasUser: !!userId, credits });
      }
    }
    // Other event types acknowledged but not acted on.
    return res.status(200).json({ received: true });
  } catch (err) {
    log.err("stripe", "handler-error", { type: event?.type, msg: err.message });
    // 500 → Stripe retries; grantCredits idempotency makes that safe.
    return res.status(500).json({ error: "Webhook handler error" });
  }
}
