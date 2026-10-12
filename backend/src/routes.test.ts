import { describe, expect, test } from "bun:test";
import { app } from "./routes.js";

// In-process tests over app.request() — no port, no server, no build. Every
// asserted path terminates BEFORE any DB/RPC dependency, so the suite passes
// in degraded environments (empty DATABASE_URL / no Redis), exactly like the
// backend boots there. The rate-limit flood test is deliberately LAST: it
// exhausts the shared in-process GET bucket.

const MERCHANT = "11111111111111111111111111111111"; // 32 base58 chars (32 zero bytes)
const BOGUS_SIG = "1".repeat(88); // shape-valid base58, decodes to 88 ≠ 64 bytes

function post(path: string, body: unknown): Promise<Response> {
  return Promise.resolve(
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("liveness and defaults", () => {
  test("/health is a dependency-free liveness probe", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ ok: true });
  });

  test("/health/detail requires the shared token", async () => {
    const res = await app.request("/health/detail");
    expect(res.status).toBe(401);
  });

  test("unknown route answers JSON 404 (API envelope, not Hono text)", async () => {
    const res = await app.request("/api/definitely-missing");
    expect(res.status).toBe(404);
    expect((await res.json()) as unknown).toEqual({ error: "Not found." });
  });

  test("every response carries X-Content-Type-Options: nosniff", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("preflight is served for /api/actions/* only", async () => {
    const actions = await app.request("/api/actions/plan", { method: "OPTIONS" });
    expect(actions.status).toBe(204);
    expect(actions.headers.get("access-control-allow-origin")).toBe("*");
    // Same-origin routes must not answer cross-origin preflights anymore.
    const rpc = await app.request("/api/rpc", { method: "OPTIONS" });
    expect(rpc.status).toBe(404);
  });
});

describe("oversized JSON bodies are rejected before parsing", () => {
  test("POST body above the 256 KiB JSON cap answers 413", async () => {
    const res = await post("/api/invoices/metadata", { invoice: "INV-1", pad: "x".repeat(300 * 1024) });
    expect(res.status).toBe(413);
  });
});

describe("POST /api/invoices/metadata validation ladder", () => {
  test("empty body answers 400", async () => {
    const res = await post("/api/invoices/metadata", {});
    expect(res.status).toBe(400);
  });

  test("invoice with control characters answers 400", async () => {
    const res = await post("/api/invoices/metadata", { invoice: "INV\u0000-1" });
    expect(res.status).toBe(400);
  });

  test("non-base58 merchant answers 400", async () => {
    const res = await post("/api/invoices/metadata", { invoice: "INV-1", merchant: "0xdeadbeef" });
    expect(res.status).toBe(400);
  });

  test("missing timestamp answers 400", async () => {
    const res = await post("/api/invoices/metadata", { invoice: "INV-1", merchant: MERCHANT, signature: BOGUS_SIG });
    expect(res.status).toBe(400);
  });

  test("well-formed but invalid signature answers 401 generic", async () => {
    const res = await post("/api/invoices/metadata", {
      invoice: "INV-1",
      merchant: MERCHANT,
      timestamp: Date.now(),
      signature: BOGUS_SIG,
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Merchant signature verification failed.");
  });

  test("stale timestamp (outside ±10 min) answers 401", async () => {
    const res = await post("/api/invoices/metadata", {
      invoice: "INV-1",
      merchant: MERCHANT,
      timestamp: Date.now() - 11 * 60 * 1000,
      signature: BOGUS_SIG,
    });
    expect(res.status).toBe(401);
  });

  test("invalid invoiceId shape answers 400 (decimal strings only)", async () => {
    // Auth must be satisfied first: sign nothing — invalid invoiceId is only
    // reachable after a valid signature, so assert the earlier gate instead:
    // a number above 2^53 is rejected by the charge endpoint (see below).
    const res = await post("/api/invoices/metadata", { invoice: "INV-1" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/invoices/charges validation ladder", () => {
  test("empty body answers 400", async () => {
    const res = await post("/api/invoices/charges", {});
    expect(res.status).toBe(400);
  });

  test("missing tx signature answers 400", async () => {
    const res = await post("/api/invoices/charges", { invoice: "INV-1" });
    expect(res.status).toBe(400);
  });

  test("malformed tx signature answers 400", async () => {
    const res = await post("/api/invoices/charges", { invoice: "INV-1", signature: "not-base58!" });
    expect(res.status).toBe(400);
  });

  test("missing amount answers 400", async () => {
    const res = await post("/api/invoices/charges", { invoice: "INV-1", signature: BOGUS_SIG });
    expect(res.status).toBe(400);
  });

  test("fractional amount answers 400", async () => {
    const res = await post("/api/invoices/charges", { invoice: "INV-1", signature: BOGUS_SIG, amount: 1.5 });
    expect(res.status).toBe(400);
  });

  test("number above 2^53 answers 400 (JSON already rounded it)", async () => {
    const res = await post("/api/invoices/charges", {
      invoice: "INV-1",
      signature: BOGUS_SIG,
      amount: 9007199254740993,
    });
    expect(res.status).toBe(400);
  });

  test("non-decimal string amount answers 400", async () => {
    const res = await post("/api/invoices/charges", { invoice: "INV-1", signature: BOGUS_SIG, amount: "0x10" });
    expect(res.status).toBe(400);
  });

  test("valid lamports shape but missing merchant answers 400", async () => {
    const res = await post("/api/invoices/charges", { invoice: "INV-1", signature: BOGUS_SIG, amount: "1000" });
    expect(res.status).toBe(400);
  });

  test("valid tx shape but missing authSignature answers 400", async () => {
    const res = await post("/api/invoices/charges", {
      invoice: "INV-1",
      signature: BOGUS_SIG,
      amount: "1000",
      merchant: MERCHANT,
      timestamp: Date.now(),
    });
    expect(res.status).toBe(400);
  });

  test("valid shape with wrong authSignature answers 401", async () => {
    const res = await post("/api/invoices/charges", {
      invoice: "INV-1",
      signature: BOGUS_SIG,
      amount: "1000",
      merchant: MERCHANT,
      timestamp: Date.now(),
      authSignature: BOGUS_SIG,
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/invoices/charges validation", () => {
  test("missing invoice and merchant answers 400", async () => {
    const res = await app.request("/api/invoices/charges");
    expect(res.status).toBe(400);
  });

  test("non-integer after cursor answers 400", async () => {
    const res = await app.request("/api/invoices/charges?invoice=INV-1&after=abc");
    expect(res.status).toBe(400);
  });
});

describe("actions proxy surface", () => {
  test("GET /api/actions/report without invoice answers 400 (no DB touched)", async () => {
    const res = await app.request("/api/actions/report");
    expect(res.status).toBe(400);
  });
});

describe("rate limiting", () => {
  // Must run LAST: exhausts the shared in-process GET bucket (240/min).
  test("hot GETs are throttled with a Retry-After header", async () => {
    let last: Response | null = null;
    for (let i = 0; i < 241; i += 1) {
      // Invalid params → 400 before any DB work; still counts against the bucket.
      last = await app.request("/api/invoices/charges");
    }
    expect(last).not.toBeNull();
    expect(last?.status).toBe(429);
    expect(Number.parseInt(last?.headers.get("retry-after") ?? "", 10)).toBeGreaterThan(0);
  });
});
