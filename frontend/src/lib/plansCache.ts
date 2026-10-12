import { connection, fetchPlans, type Plan } from "./chain.js";

// SSR pages (/, /merchant) embed the live plans list server-side. A public
// RPC getProgramAccounts scan per page view is slow and rate-limits fast,
// so frontmatter reads go through this small TTL cache. The client islands
// still fetch their own fresh copy — this only smooths first paint.
let cache: { at: number; plans: Plan[] } | null = null;
const TTL_MS = 60_000;
/** Short negative cache so an RPC outage does not trigger a scan stampede. */
const NEGATIVE_TTL_MS = 5_000;

let inflight: Promise<Plan[]> | null = null;
let failedAt = 0;
let lastError: unknown = null;

export async function fetchPlansCached(): Promise<Plan[]> {
  if (cache !== null && Date.now() - cache.at < TTL_MS) return cache.plans;
  // Share one in-flight scan between concurrent SSR requests; replay the
  // same failure (without re-scanning) for a few seconds after an error.
  if (inflight !== null) return inflight;
  if (Date.now() - failedAt < NEGATIVE_TTL_MS && lastError !== null) {
    throw lastError;
  }
  inflight = fetchPlans(connection())
    .then((plans) => {
      cache = { at: Date.now(), plans };
      return plans;
    })
    .catch((err: unknown) => {
      failedAt = Date.now();
      lastError = err;
      throw err;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
