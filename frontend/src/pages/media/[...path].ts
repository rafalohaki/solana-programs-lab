import type { APIRoute } from "astro";

export const prerender = false;

// Local media CDN proxy: GET /media/* → RustFS (S3) bucket `media`.
// Same-origin like /api/*, so pages reference /media/<key> with no CORS or
// external CDN setup. Read-only by design — uploads go through the S3 API
// (aws-cli / mc) with the keys from .env, never through this public route.
function mediaBase(): string {
  return (process.env.RUSTFS_URL ?? "http://media:9000").replace(/\/+$/, "");
}

function targetUrl(path: string | undefined): string {
  const suffix = path === undefined || path.length === 0 ? "" : `/${path}`;
  return `${mediaBase()}/media${suffix}`;
}

async function proxy(request: Request, path: string | undefined): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Media proxy is read-only." }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }
  const conditional: HeadersInit = {};
  const inm = request.headers.get("if-none-match");
  const ims = request.headers.get("if-modified-since");
  if (inm !== null) conditional["if-none-match"] = inm;
  if (ims !== null) conditional["if-modified-since"] = ims;
  let upstream: Response;
  try {
    upstream = await fetch(targetUrl(path), {
      method: request.method,
      headers: { accept: request.headers.get("accept") ?? "*/*", ...conditional },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    // Opaque body: upstream error messages can embed internal topology
    // (RustFS host:port). Log server-side, return generic JSON.
    console.error(`media proxy: ${request.method} /media/${path ?? ""} failed:`, e);
    return new Response(JSON.stringify({ error: "Media store unreachable." }), {
      status: 502,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }
  const outHeaders = new Headers();
  for (const h of ["content-type", "content-length", "etag", "last-modified", "cache-control"]) {
    const v = upstream.headers.get(h);
    if (v !== null) outHeaders.set(h, v);
  }
  // Media keys are write-once (uuid names) — cache hard at the edge.
  if (!outHeaders.has("cache-control")) outHeaders.set("cache-control", "public, max-age=31536000, immutable");
  // Never sniff served bytes into executable context; the sandbox CSP keeps a
  // future content-type slip (SVG/HTML in ALLOWED_TYPES) inert.
  outHeaders.set("x-content-type-options", "nosniff");
  outHeaders.set("content-security-policy", "default-src 'none'; sandbox");
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}

export const GET: APIRoute = (ctx) => proxy(ctx.request, ctx.params.path);
export const HEAD: APIRoute = (ctx) => proxy(ctx.request, ctx.params.path);
