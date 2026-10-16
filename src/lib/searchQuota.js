// OpenCITE — free-tier web search quota (client)
//
// Soft daily cap for anyone not on a paid plan. Web search runs in the browser (useSearch →
// adapters), so the server never sees it; this is a localStorage counter per UTC day — a nudge
// toward subscribing, not access control (clearing site data or a private window resets it, and
// blocked storage fails open). The limit and the "who is uncapped" rule are SSOT in
// api/_shared/plans.js.

import { FREE_WEB_DAILY_SEARCHES, hasUnlimitedWebSearch } from "../../api/_shared/plans.js";

export { FREE_WEB_DAILY_SEARCHES };

const KEY = "opencite_free_searches";
const today = () => new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

function usedToday() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v?.day === today() ? Number(v.count) || 0 : 0;
  } catch { return 0; }
}

// Count one search for `planId` (BillingContext tier). Returns true when the search may run;
// false when a capped user has already used today's allowance (nothing is recorded then).
export function consumeWebSearch(planId) {
  if (hasUnlimitedWebSearch(planId)) return true;
  const used = usedToday();
  if (used >= FREE_WEB_DAILY_SEARCHES) return false;
  try { localStorage.setItem(KEY, JSON.stringify({ day: today(), count: used + 1 })); } catch {}
  return true;
}
