// OpenCITE — runtime platform detection (client)
//
// Web by default. A native shell (Capacitor / Tauri / Electron / RN-WebView) is
// expected to set `window.__OPENCITE_PLATFORM__` ("ios" | "android" | "macos" |
// "windows") at boot, or expose Capacitor. The Plans panel reads this to route a
// subscription purchase to the correct rail:
//
//   - iOS / Android  → Apple / Google IN-APP PURCHASE (store policy requires it for
//                      digital subscriptions; Stripe checkout would be rejected).
//   - web / desktop  → Stripe Checkout.
//
// The machine / API credit packs are developer + agent facing — bought on the web
// dashboard, never consumed inside the mobile app — so they always use Stripe and
// are unaffected by store rules.

export function getPlatform() {
  if (typeof window === "undefined") return "web";
  const forced = window.__OPENCITE_PLATFORM__;
  if (forced) return String(forced).toLowerCase();
  const cap = window.Capacitor?.getPlatform?.();
  if (cap === "ios" || cap === "android") return cap;
  return "web";
}

export const isNativeMobile = (p = getPlatform()) => p === "ios" || p === "android";

// Which purchase rail a SUBSCRIPTION must use on this platform.
export const subscriptionRail = (p = getPlatform()) => (isNativeMobile(p) ? "iap" : "stripe");

// Human label for the store, used in CTA copy on mobile.
export const storeName = (p = getPlatform()) =>
  p === "ios" ? "App Store" : p === "android" ? "Google Play" : "";
