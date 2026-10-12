import { app } from "./routes.js";

const DEFAULT_PORT = 3001;

function resolvePort(): number {
  const parsed = Number(process.env.PORT ?? String(DEFAULT_PORT));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

const port = resolvePort();

Bun.serve({
  // Socket-level cap: 10 MiB media upload + headroom for JSON bodies. Bun
  // tears oversized connections down before app code buffers anything.
  maxRequestBodySize: 11 * 1024 * 1024,
  // Bun's real default (~10s, includes in-flight requests — despite the
  // bun-types JSDoc claiming 120) resets slow handlers mid-flight: the RPC
  // proxy alone waits up to 30s on its upstream (rpc.ts). 60s keeps every
  // legitimate handler under the cap while still reaping dead sockets.
  idleTimeout: 60,
  port,
  hostname: "0.0.0.0",
  // Hand the Bun server to Hono via env so the rate limiter can key on the
  // real kernel socket IP (server.requestIP) instead of client-set
  // forwarding headers (see clientBucketIp in routes.ts).
  fetch: (req, server) => app.fetch(req, { bunServer: server }),
});
console.log(`backend listening on 0.0.0.0:${port}`);
