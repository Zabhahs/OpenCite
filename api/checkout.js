// OpenCITE — Stripe Checkout session creator
// Route: /api/checkout
// Runtime: Node.js (Prisma + Stripe)
// Auth: session cookie via Auth.js — a signed-in HUMAN starts a purchase.
//
// POST /api/checkout  body { plan: "student"|"pro" }   → subscription Checkout
//                     body { pack: "pack_10k"|... }     → one-time pack Checkout
// Returns { url } — the frontend redirects the browser to Stripe-hosted Checkout.
//
// Web/desktop only. Native iOS/Android use Apple/Google IAP for subscriptions (store
// policy), so the client never calls this for the IAP rail. The webhook
// (stripe/webhook.js) is what actually grants credits / sets the plan on completion;
// this endpoint only opens the session. Identity is carried two ways for the webhook:
//   - client_reference_id = User.id  (primary)
//   - a persisted Stripe Customer    (so renewals resolve back to the user)
//
// Requires STRIPE_SECRET_KEY + the relevant STRIPE_PRICE_* envs; returns 503 if unset.

import { prisma } from "./_shared/prisma.js";
import { setCorsHeaders, getSession, TRUSTED_ORIGINS, isTrustedOrigin } from "./_shared/auth.js";
import { parseBody } from "./_shared/parseBody.js";
import { getPlan, getPack, stripePriceId, PLANS, CREDIT_PACKS } from "./_shared/plans.js";
import { log } from "./_shared/log.js";

// Resolve a safe absolute base URL for success/cancel redirects.
// F-415: only our own origins (prod domains + opencite*.vercel.app previews) — the old
// endsWith(".vercel.app") accepted any Vercel project (e.g. evil.vercel.app) as a
// post-checkout redirect target.
function baseUrl(req) {
  const origin = req.headers.origin;
  return isTrustedOrigin(origin) ? origin : TRUSTED_ORIGINS[0];
}

export default async function handler(req, res) {
  setCorsHeaders(req, res, "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: "Billing not configured" });

  const user = await getSession(req);
  if (!user) return res.status(401).json({ error: "Please sign in to continue" });

  const body = await parseBody(req, res);
  if (!body) return; // 413 already sent (F-400)
  const wantPlan = typeof body.plan === "string" ? body.plan : null;
  const wantPack = typeof body.pack === "string" ? body.pack : null;
  if (!wantPlan && !wantPack) return res.status(400).json({ error: "Specify a plan or pack" });

  // Validate the requested item and resolve its Stripe Price id (server-authoritative).
  let mode, priceId, metadata;
  if (wantPlan) {
    const plan = PLANS[wantPlan];
    if (!plan || !plan.subscription) return res.status(400).json({ error: "Unknown plan" });
    // Student tier is gated on verification (decision: ID upload + approval).
    if (plan.requiresStudentVerification) {
      const u = await prisma.user.findUnique({ where: { id: user.id }, select: { is_student_verified: true } });
      if (!u?.is_student_verified) {
        return res.status(403).json({ error: "Student verification required before subscribing", code: "needs_student_verification" });
      }
    }
    priceId = stripePriceId(plan);
    mode = "subscription";
    metadata = { plan: plan.id };
  } else {
    const pack = CREDIT_PACKS[wantPack];
    if (!pack) return res.status(400).json({ error: "Unknown pack" });
    priceId = stripePriceId(pack);
    mode = "payment";
    metadata = { pack: pack.id };
  }
  if (!priceId) return res.status(503).json({ error: "This option isn't available yet" });

  let Stripe;
  try {
    ({ default: Stripe } = await import("stripe"));
  } catch {
    return res.status(503).json({ error: "Billing dependency unavailable" });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    // Reuse or create the user's Stripe Customer so renewals map back to them.
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, stripe_customer_id: true },
    });
    let customerId = row?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: row?.email || user.email || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripe_customer_id: customerId } });
    }

    const base = baseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode,
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata,
      // Mirror metadata onto the subscription so subscription.* events carry it too.
      ...(mode === "subscription" ? { subscription_data: { metadata } } : {}),
      allow_promotion_codes: true,
      success_url: `${base}/?checkout=success`,
      cancel_url: `${base}/?checkout=cancel`,
    });

    log("stripe", "checkout-created", { userId: user.id, mode, ...metadata });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    log.err("stripe", "checkout-error", { userId: user.id, msg: err.message });
    return res.status(500).json({ error: "Couldn't start checkout — please try again" });
  }
}
