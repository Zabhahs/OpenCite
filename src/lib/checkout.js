// OpenCITE — checkout client (web/desktop)
//
// Thin wrapper over POST /api/checkout. Returns { url } for the Stripe-hosted
// Checkout page (caller redirects the browser there) or { error, code } on failure.
// Native iOS/Android subscriptions use Apple/Google IAP and never call this.

export async function createCheckoutSession({ plan, pack } = {}) {
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(plan ? { plan } : { pack }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error || "Checkout unavailable", code: data?.code };
    return { url: data?.url };
  } catch {
    return { error: "Network error — please try again" };
  }
}
