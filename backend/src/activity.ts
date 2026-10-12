import { redis } from "bun";
import { Hono } from "hono";
import { createHash, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// On-chain activity feed — Helius enhanced webhooks → Redis list → public GET.
//
// POST /hooks/helius (mounted as /api/hooks/helius in routes.ts): Helius
//   calls this on every transaction touching the subscriptions program.
//   Auth = shared secret: the `authorization` header must match
//   HELIUS_WEBHOOK_SECRET (Helius `authHeader` field). Unset secret keeps the
//   receiver permanently off (503, never a blind 200). Wrong secret = 401.
//   The body is a Helius enhanced array; every entry is parsed defensively
//   (missing fields = skip the entry, never a 500) and filtered to entries
//   that mention our program. Matching events are LPUSHed to Redis `activity`
//   (LTRIM 20), best-effort like routes.ts cacheSet — Redis down degrades to
//   an acked-but-unstored webhook, never an error to Helius.
// GET /activity (mounted as /api/activity): LRANGE 0-9 →
//   {events:[{signature,type,at}]}. Empty (no Redis, no events, corrupt
//   entries) = [], never a mock.
//
// Program id source: actions/src/config.ts SUBSCRIPTIONS_PROGRAM_ID and
// frontend/.env PUBLIC_SUBSCRIPTIONS_PROGRAM_ID (deployed devnet program).
// Overridable via SUBSCRIPTIONS_PROGRAM_ID without a code change.
// ---------------------------------------------------------------------------

/** Deployed subscriptions program (devnet) — see actions/src/config.ts. */
const PROGRAM_ID =
  process.env.SUBSCRIPTIONS_PROGRAM_ID ?? "2jK5cy3PaCnD2cLfp3VCqxySBx4dyDhBc7GuutACvJuw";

/** Redis list holding the newest-first activity events (JSON strings). */
const ACTIVITY_KEY = "activity";
/** Ring size: the feed only ever reads the head, old tail expires by trim. */
const ACTIVITY_KEEP = 20;
/** Public read window — the feed renders at most 5, headroom for polling. */
const ACTIVITY_READ = 10;
/** Per-request parse cap: a Helius batch is tiny, this bounds abuse. */
const MAX_ENTRIES = 200;

export const activityApp = new Hono();

/** Constant-time shared-secret comparison (routes.ts tokenMatches discipline). */
function secretMatches(candidate: string, secret: string): boolean {
  if (candidate === "" || secret === "") return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export interface ActivityEvent {
  signature: string;
  type: string;
  at: number;
}

/** Pull log lines from wherever Helius nested them (schema varies by type). */
function entryLogs(entry: Record<string, unknown>): string {
  const buckets: unknown[] = [entry["logMessages"]];
  const meta = entry["meta"];
  if (meta !== null && typeof meta === "object") {
    buckets.push((meta as Record<string, unknown>)["logMessages"]);
  }
  const tx = entry["transaction"];
  if (tx !== null && typeof tx === "object") {
    const txMeta = (tx as Record<string, unknown>)["meta"];
    if (txMeta !== null && typeof txMeta === "object") {
      buckets.push((txMeta as Record<string, unknown>)["logMessages"]);
    }
  }
  const lines: string[] = [];
  for (const bucket of buckets) {
    if (Array.isArray(bucket)) {
      for (const line of bucket) {
        if (typeof line === "string") lines.push(line);
      }
    }
  }
  return lines.join("\n");
}

/** Event type from program log names — InvoiceCharged first (contains "Charged"). */
function eventType(logs: string): string {
  if (logs.includes("InvoiceCharged")) return "InvoiceCharged";
  if (logs.includes("Charged")) return "Charged";
  if (logs.includes("Cancelled")) return "Cancelled";
  if (logs.includes("Subscribed")) return "Subscribed";
  return "transaction";
}

/** Defensive parse: malformed entries are skipped, never throw. */
function parseHeliusEntries(body: unknown): ActivityEvent[] {
  if (!Array.isArray(body)) return [];
  const events: ActivityEvent[] = [];
  for (const raw of body.slice(0, MAX_ENTRIES)) {
    try {
      if (raw === null || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      // Program filter: the entry must mention our program anywhere
      // (accountData, instructions, invocation logs) — else it is not ours.
      if (!JSON.stringify(entry).includes(PROGRAM_ID)) continue;
      let signature = entry["signature"];
      if (typeof signature !== "string" || signature === "") {
        const tx = entry["transaction"];
        const sigs =
          tx !== null && typeof tx === "object"
            ? (tx as Record<string, unknown>)["signatures"]
            : undefined;
        signature = Array.isArray(sigs) && typeof sigs[0] === "string" ? sigs[0] : "";
      }
      if (typeof signature !== "string" || signature === "") continue;
      const ts = entry["timestamp"];
      const at =
        typeof ts === "number" && Number.isFinite(ts)
          ? Math.floor(ts * 1000) // Helius timestamp is unix seconds
          : Date.now();
      events.push({ signature, type: eventType(entryLogs(entry)), at });
    } catch {
      continue;
    }
  }
  return events;
}

activityApp.post("/hooks/helius", async (c) => {
  const secret = process.env.HELIUS_WEBHOOK_SECRET ?? "";
  if (secret === "") {
    return c.json({ error: "Webhook receiver not configured (HELIUS_WEBHOOK_SECRET unset)." }, 503);
  }
  const header = c.req.header("authorization") ?? "";
  // Helius sends the configured authHeader verbatim; accept it raw or as Bearer.
  const candidate = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : header;
  if (!secretMatches(candidate, secret)) {
    return c.json({ error: "Invalid webhook secret." }, 401);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }
  const events = parseHeliusEntries(body);
  if (events.length > 0 && (process.env.REDIS_URL ?? "") !== "") {
    try {
      // One LPUSH per event, oldest first — the head ends newest-first.
      for (const event of events) {
        await redis.lpush(ACTIVITY_KEY, JSON.stringify(event));
      }
      await redis.ltrim(ACTIVITY_KEY, 0, ACTIVITY_KEEP - 1);
    } catch {
      /* ignore — unstored webhook still acks */
    }
  }
  return c.json({ ok: true, stored: events.length });
});

activityApp.get("/activity", async (c) => {
  if ((process.env.REDIS_URL ?? "") === "") return c.json({ events: [] });
  try {
    const raw = await redis.lrange(ACTIVITY_KEY, 0, ACTIVITY_READ - 1);
    const events: ActivityEvent[] = [];
    for (const item of raw) {
      try {
        if (typeof item !== "string") continue;
        const parsed: unknown = JSON.parse(item);
        if (parsed === null || typeof parsed !== "object") continue;
        const { signature, type, at } = parsed as Record<string, unknown>;
        if (typeof signature !== "string" || typeof type !== "string" || typeof at !== "number") {
          continue;
        }
        events.push({ signature, type, at });
      } catch {
        continue;
      }
    }
    return c.json({ events });
  } catch {
    return c.json({ events: [] });
  }
});
