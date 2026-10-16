// OpenCITE — checkout client (web/desktop)
//
// Thin wrapper over POST /api/checkout. Returns { url } for the Stripe-hosted
// page (caller redirects the browser there) or { error, code } on failure.
// Native iOS/Android subscriptions use Apple/Google IAP and never call this.

async function postCheckout(body) {
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error || "Checkout unavailable", code: data?.code };
    return { url: data?.url };
  } catch {
    return { error: "Network error — please try again" };
  }
}

export function createCheckoutSession({ plan, pack } = {}) {
  return postCheckout(plan ? { plan } : { pack });
}

// v0.47: Stripe Customer Portal — cancel, payment method, invoices, billing details.
export function openBillingPortal() {
  return postCheckout({ portal: true });
}
