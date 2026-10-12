import type { APIRoute } from "astro";

export const prerender = false;

// Universal `/api/*` proxy → backend. No business logic here: method, query
// and body bytes pass through 1:1, and the backend's status, body and
// selected headers are returned as-is. CORS lives ONLY on the backend:
// preflights are forwarded like any other method and answered by the
// Actions-spec handler (actions/src/cors.ts, mounted as
// `app.options("/api/*")` in backend/src/routes.ts) — one policy, no drift.
//
// NOTE: `BACKEND_URL` is read via `process.env` (server-only). NEVER use
// `import.meta.env` for it — that would leak the internal backend address
// into the client bundle.

/** Client-supplied routing headers are attacker input (bun-hono standard 4):
 *  browser fetch may set x-forwarded-for freely, so forwarding it 1:1 lets
 *  clients rotate the backend's rate-limit key (XFF[0]) or poison other
 *  buckets. The whole x-forwarded-* family and x-real-ip are stripped from
 *  the pass-through; a truthful x-forwarded-for is set below instead. */
function isSpoofableHeader(name: string): boolean {
  return name === "x-real-ip" || name.startsWith("x-forwarded-");
}

function backendBase(): string {
  const raw = process.env["BACKEND_URL"] ?? "http://backend:3001";
  return raw.replace(/\/+$/, "");
}

function targetUrl(request: Request, path: string | undefined): string {
  const query = new URL(request.url).search;
  const suffix = path === undefined || path.length === 0 ? "" : `/${path}`;
  return `${backendBase()}/api${suffix}${query}`;
}

async function proxy(request: Request, path: string | undefined, clientAddress: string): Promise<Response> {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType !== null) headers.set("content-type", contentType);
  // Forward application-defined x-* headers 1:1 (mail token, media auth
  // merchant/timestamp/signature, …) except the spoofable routing headers.
  // cf-connecting-ip does not match x-* and stays unforwarded — how to trust
  // it is the backend's call (tracked backend-side).
  for (const [name, value] of request.headers) {
    if (name.startsWith("x-") && !isSpoofableHeader(name)) headers.set(name, value);
  }
  // Set (never append) x-forwarded-for ourselves: behind the Cloudflare tunnel
  // the edge overwrites cf-connecting-ip with the real client IP, so prefer it
  // and fall back to the socket address for direct traffic. The backend
  // rate-limits on XFF[0] (backend/src/routes.ts), so this keeps per-IP
  // buckets honest instead of attacker-chosen.
  headers.set("x-forwarded-for", request.headers.get("cf-connecting-ip") ?? clientAddress);

  const init: RequestInit & { duplex?: "half" } = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    // Stream the body 1:1 (no SSR buffering of multi-MB uploads); Bun's
    // socket cap (see backend/src/index.ts) bounds what can arrive at all.
    init.body = request.body;
    init.duplex = "half"; // required by undici when the body is a stream
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl(request, path), {
      ...init,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    // Opaque body: upstream error messages can embed internal topology
    // (backend host:port, DNS, timeouts). Log server-side, return generic.
    console.error(`api proxy: ${request.method} /api/${path ?? ""} failed:`, e);
    return new Response(JSON.stringify({ error: "Backend unreachable." }), {
      status: 502,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const outHeaders = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType !== null) outHeaders.set("content-type", upstreamType);
  // Per-request JSON is uncacheable by default: forward the backend's policy
  // when it sets one, otherwise no-store, so an edge "cache everything" rule
  // can never serve one user's response to another. (astro standard 3)
  outHeaders.set("cache-control", upstream.headers.get("cache-control") ?? "no-store");
  outHeaders.set("x-content-type-options", "nosniff");
  // Stream the body straight through — arrayBuffer() here would buffer whole
  // responses (MB-scale RPC results) in proxy RSS for no benefit.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}

// Preflights included: the backend answers them (see header comment), so the
// proxy never speaks CORS with a second voice.
export const OPTIONS: APIRoute = (ctx) => proxy(ctx.request, ctx.params.path, ctx.clientAddress);

export const GET: APIRoute = (ctx) => proxy(ctx.request, ctx.params.path, ctx.clientAddress);

export const POST: APIRoute = (ctx) => proxy(ctx.request, ctx.params.path, ctx.clientAddress);

// Media uploads arrive as PUT (see backend/src/media.ts); DELETE passes for
// future cleanup routes — both flow through the same 1:1 proxy.
export const PUT: APIRoute = (ctx) => proxy(ctx.request, ctx.params.path, ctx.clientAddress);

export const DELETE: APIRoute = (ctx) => proxy(ctx.request, ctx.params.path, ctx.clientAddress);
