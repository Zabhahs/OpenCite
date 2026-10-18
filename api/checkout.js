// OpenCITE — Stripe Checkout session creator
// Route: /api/checkout
// Runtime: Node.js (Prisma + Stripe)
// Auth: session cookie via Auth.js — a signed-in HUMAN starts a purchase.
//
// POST /api/checkout  body { plan: "student"|"pro" }   → subscription Checkout
//                     body { pack: "pack_10k"|... }     → one-time pack Checkout
//                     body { portal: true }             → Stripe Customer Portal (v0.47)
// Returns { url } — the frontend redirects the browser to the Stripe-hosted page.
//
// v0.47 Customer Portal: self-serve cancel, payment-method update, invoice/receipt history and
// billing-details update. Lives on this route (not its own file) because of Vercel Hobby's
// 12-function cap. Which features the portal offers is Stripe-side config: the account's default
// portal configuration, or STRIPE_PORTAL_CONFIGURATION (a bpc_… id) when set. Cancellation and
// plan changes made there reach us as customer.subscription.updated/deleted (stripe/webhook.js).
//
// Web/desktop only. Native iOS/Android use Apple/Google IAP for subscriptions (store
// policy), so the client never calls this for the IAP rail. The webhook
// (stripe/webhook.js) is what actually grants credits / sets the plan on completion;
// this endpoint only opens the session. Identity is carried two ways for the webhook:
//   - client_reference_id = User.id  (primary)
//   - a persisted Stripe Customer    (so renewals resolve back to the user)
//
// Requires STRIPE_SECRET_KEY + the relevant STRIPE_PRICE_* envs; returns 503 if unset.
//
// Managed Payments (Stripe as merchant of record — Stripe/Link collects + remits sales
// tax/VAT/GST, handles fraud, disputes and transaction support). OFF unless
// STRIPE_MANAGED_PAYMENTS=1. Turn it on ONLY after (a) Dashboard → Settings → Managed Payments is
// enabled and its terms accepted, and (b) every pack Product carries an eligible tax_code
// (txcd_10701400, Website Information Services – business use). Otherwise Stripe rejects the
// session and nobody can buy. Packs (mode=payment) only — subscriptions are standard Checkout.
// The webhook is unchanged: checkout.session.completed still grants credits, and Stripe-issued
// refunds / disputes still arrive as charge.refunded / charge.dispute.created → claw-back.
// Server-only flag on purpose: plans.js is bundled into the browser (src/constants/pricing.js).
// v0.48: the metered `api` plan (postpaid) ALSO runs under Managed Payments — probe P0-1
// (2026-10-17, sandbox) confirmed MP Checkout accepts a meter-backed metered price in
// subscription mode. Student/Pro stay standard Checkout.
const MANAGED_PAYMENTS_ENABLED = process.env.STRIPE_MANAGED_PAYMENTS === "1";
// The pinned SDK (stripe@17 → 2025-02-24.acacia) predates Managed Payments (needs ≥ 2025-03-31.basil),
// so a Managed Payments session overrides the version for that one request only — the account
// default, the other calls here, and webhook payloads (rendered at the endpoint's version) are
// untouched. Version per Stripe's Managed Payments blueprint.
const MANAGED_PAYMENTS_API_VERSION = "2026-02-25.preview";

import { prisma } from "./_shared/prisma.js";
import { setCorsHeaders, getSession, TRUSTED_ORIGINS, isTrustedOrigin } from "./_shared/auth.js";
import { parseBody } from "./_shared/parseBody.js";
import { stripePriceId, PLANS, CREDIT_PACKS, SUBSCRIPTIONS_ENABLED, API_UNIT_PRICE_USD } from "./_shared/plans.js";
import { log } from "./_shared/log.js";
import { checkRateLimit, ANON_PLAN } from "./_shared/ratelimit.js";

// Resolve a safe absolute base URL for success/cancel redirects.
// F-415: only our own origins (prod domains + opencite*.vercel.app previews) — the old
// endsWith(".vercel.app") accepted any Vercel project (e.g. evil.vercel.app) as a
// post-checkout redirect target.
function baseUrl(req) {
  const origin = req.headers.origin;
  return isTrustedOrigin(origin) ? origin : TRUSTED_ORIGINS[0];
}

async function loadStripe() {
  try {
    const { default: Stripe } = await import("stripe");
    return new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch {
    return null;
  }
}

// v0.47: open a Customer Portal session for the signed-in user's own Stripe Customer. Only a
// customer id already persisted on the user row is used — never one from the request — so a
// user can only ever manage their own billing. No customer yet ⇒ nothing to manage (404).
async function openPortal(req, res, user) {
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { stripe_customer_id: true } });
  if (!row?.stripe_customer_id) {
    return res.status(404).json({ error: "No billing account yet — subscribe or buy a pack first.", code: "no_customer" });
  }
  const stripe = await loadStripe();
  if (!stripe) return res.status(503).json({ error: "Billing dependency unavailable" });
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${baseUrl(req)}/?portal=return`,
      ...(process.env.STRIPE_PORTAL_CONFIGURATION ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION } : {}),
    });
    log("stripe", "portal-created", { userId: user.id });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    log.err("stripe", "portal-error", { userId: user.id, msg: err.message });
    return res.status(500).json({ error: "Couldn't open billing management — please try again" });
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res, "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: "Billing not configured" });

  // v0.48 (sprint v0.45 T7 remainder): per-IP window before the session lookup + Stripe work.
  const xff = req.headers?.["x-forwarded-for"];
  const ip = ((Array.isArray(xff) ? xff[0] : xff) || "").split(",")[0].trim() || "anon";
  const rl = await checkRateLimit(`ip:${ip}`, ANON_PLAN);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "Rate limit exceeded. Please retry later.", code: "rate_limited", retry_after: rl.retryAfter });
  }

  const user = await getSession(req);
  if (!user) return res.status(401).json({ error: "Please sign in to continue" });

  const body = await parseBody(req, res);
  if (!body) return; // 413 already sent (F-400)
  if (body.portal === true) return openPortal(req, res, user);
  const wantPlan = typeof body.plan === "string" ? body.plan : null;
  const wantPack = typeof body.pack === "string" ? body.pack : null;
  if (!wantPlan && !wantPack) return res.status(400).json({ error: "Specify a plan or pack" });

  // Validate the requested item and resolve its Stripe Price id (server-authoritative).
  let mode, priceId, metadata, postpaid = false;
  if (wantPlan) {
    const plan = PLANS[wantPlan];
    if (!plan || !plan.subscription) return res.status(400).json({ error: "Unknown plan" });
    postpaid = !!plan.postpaid;
    // Kill switch for the FLAT subscription rail (plans.js SUBSCRIPTIONS_ENABLED). The metered
    // `api` plan is the machine product and is not behind it (v0.48).
    if (!SUBSCRIPTIONS_ENABLED && !postpaid) {
      return res.status(400).json({ error: "Subscriptions are not available; buy an API credit pack instead.", code: "subscriptions_disabled" });
    }
    // v0.47: Student is honor-system (see plans.js) — no is_student_verified gate.
    // One subscription per user: a second Checkout would bill both in parallel. Plan changes and
    // cancellation go through the Customer Portal ({ portal: true }).
    const existing = await prisma.user.findUnique({ where: { id: user.id }, select: { stripe_subscription_id: true } });
    if (existing?.stripe_subscription_id) {
      return res.status(409).json({ error: "You already have a subscription — use Manage billing to change or cancel it.", code: "already_subscribed" });
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

  const stripe = await loadStripe();
  if (!stripe) return res.status(503).json({ error: "Billing dependency unavailable" });

  try {
    // Reuse or create the user's Stripe Customer so renewals map back to them.
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, stripe_customer_id: true },
    });
    let customerId = row?.stripe_customer_id || null;
    if (!customerId) {
      // v0.46: idempotency key = user id, so two concurrent first checkouts cannot mint two
      // Stripe Customers (the orphan would never map back to the user on renewals).
      const customer = await stripe.customers.create(
        { email: row?.email || user.email || undefined, metadata: { userId: user.id } },
        { idempotencyKey: `cust_${user.id}` }
      );
      customerId = customer.id;
      await prisma.user.updateMany({ where: { id: user.id, stripe_customer_id: null }, data: { stripe_customer_id: customerId } });
    }

    const base = baseUrl(req);
    // Packs and the metered `api` plan use Managed Payments; flat subscriptions (Student/Pro)
    // stay standard Checkout (see header).
    const managed = MANAGED_PAYMENTS_ENABLED && (mode === "payment" || postpaid);
    const session = await stripe.checkout.sessions.create({
      mode,
      customer: customerId,
      client_reference_id: user.id,
      // v0.48: a metered (meter-backed) price must NOT carry a quantity — Stripe rejects it.
      line_items: [postpaid ? { price: priceId } : { price: priceId, quantity: 1 }],
      metadata,
      // Mirror metadata onto the subscription so subscription.* events carry it too.
      // v0.48: postpaid subscriptions use flexible billing mode so Stripe's "minimum amount before
      // collection" script can be enabled later without migrating subscriptions (log §2 S3).
      ...(mode === "subscription" ? { subscription_data: { metadata, ...(postpaid ? { billing_mode: { type: "flexible" } } : {}) } } : {}),
      // v0.46: packs mirror metadata onto the PaymentIntent so charge.refunded / dispute events
      // (which reference the PI, not the session) can identify the pack to claw back.
      ...(mode === "payment" ? { payment_intent_data: { metadata: { ...metadata, userId: user.id } } } : {}),
      allow_promotion_codes: true,
      // v0.46: Stripe checklist — explicit ToS consent + billing address (tax location) on every sale.
      consent_collection: { terms_of_service: "required" },
      billing_address_collection: "required",
      custom_text: {
        terms_of_service_acceptance: { message: "I agree to the [Terms of Service](https://citation.today/legal/terms.html) and [Refund Policy](https://citation.today/legal/refunds.html)." },
        // v0.48: postpaid consent — Stripe requires the timing + amount basis of future charges to be stated.
        ...(postpaid ? { submit: { message: `You'll be billed monthly for API calls at $${(API_UNIT_PRICE_USD * 1000).toFixed(2)} per 1,000 (ID lookups and verification $${(API_UNIT_PRICE_USD * 100).toFixed(2)} per 1,000), after ${PLANS.api.monthlyGrant.toLocaleString()} included calls a month, up to the monthly cap you set (default $25). No charge today.` } } : {}),
      },
      success_url: `${base}/?checkout=success`,
      cancel_url: `${base}/?checkout=cancel`,
      // Every other param above is Managed-Payments-compatible (checked against Stripe's
      // "remove unsupported parameters" list: no automatic_tax, payment_method_types,
      // invoice_creation, statement_descriptor, receipt_email, shipping or Connect fields).
      ...(managed ? { managed_payments: { enabled: true } } : {}),
    }, managed ? { apiVersion: MANAGED_PAYMENTS_API_VERSION } : undefined);

    log("stripe", "checkout-created", { userId: user.id, mode, managed, postpaid, ...metadata });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    log.err("stripe", "checkout-error", { userId: user.id, msg: err.message });
    return res.status(500).json({ error: "Couldn't start checkout — please try again" });
  }
}
