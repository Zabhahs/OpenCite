// OpenCITE — chronic-failure circuit-breaker (v0.38, T1 / finding F-208)
//
// Prevents a permanently-broken adapter from silently poisoning coverage and
// billing forever. An adapter that ALWAYS throws (dead endpoint, bad query
// syntax, revoked key) would otherwise keep `failedCount > 0` on every request
// — pinning the coverage band below `full` and under-charging every paid search
// (the structural recurrence of the SciELO/OpenNeuro/ENA leak quarantined in T0).
//
// Design: an in-process, function-instance-scoped failure-streak counter. Each
// adapter id carries a consecutive-failure count, reset to 0 on any success.
// After FAILURE_STREAK_THRESHOLD consecutive failures the circuit "opens" and
// the adapter is DROPPED FROM THE ELIGIBLE SET before coverage is computed — it
// is treated as if never eligible, NOT as a failed adapter, so it no longer
// drags the coverage band or the credit charge.
//
// Deliberately NOT a durable KV store: that would add latency and a new failure
// surface. State lives in module scope, so a cold start (new deploy / new
// function instance) resets all streaks. This is intentional — transient
// outages clear themselves, and a still-broken adapter simply re-opens its
// circuit within FAILURE_STREAK_THRESHOLD requests on the fresh instance.

const streaks = new Map(); // adapterId → consecutive-failure count

export const FAILURE_STREAK_THRESHOLD = 5;

// Reset an adapter's streak on a successful (non-throwing) run. An empty result
// set is a SUCCESS ("no match"), not a failure — callers must only invoke this
// when the adapter did not throw/time out.
export function recordSuccess(id) {
  if (id) streaks.set(id, 0);
}

// Increment an adapter's consecutive-failure streak on a throw/timeout.
export function recordFailure(id) {
  if (id) streaks.set(id, (streaks.get(id) || 0) + 1);
}

// True once an adapter has failed FAILURE_STREAK_THRESHOLD times in a row on
// this function instance. Such an adapter should be filtered OUT of the eligible
// set before fan-out + coverage.
export function isCircuitOpen(id) {
  return (streaks.get(id) || 0) >= FAILURE_STREAK_THRESHOLD;
}

// Admin-only telemetry: a snapshot of every tracked adapter's current streak,
// surfaced under the `?debug=1` envelope so the admin console can see which
// adapters are degrading or circuit-opened. Never leaves the server on the
// public (origin-blind) path.
export function circuitBreakerStats() {
  return Object.fromEntries(streaks);
}
