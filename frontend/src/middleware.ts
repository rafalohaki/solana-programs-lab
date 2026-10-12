import type { MiddlewareHandler } from "astro";

// Security header belt for every server-rendered response (HTML pages and the
// /api + /media proxies). Run-time belt: the node adapter (pin 9) has no
// staticHeaders, so middleware is the only Astro-level place to set these.
//
// Roll-out per the dApp security standard: the CSP ships as Report-Only first
// — violations surface in the devtools console without breaking anything —
// and flips to an enforcing `content-security-policy` once reports are clean.
//
// Accepted Report-Only noise (known, intentional):
// - BlinkBuilder's "Preview action" fetches arbitrary user-typed endpoint
//   URLs, which connect-src 'self' flags. The report is the prompt to route
//   that feature through a same-origin proxy before enforcing.
// - `astro dev` injects dev-only inline scripts/styles the production build
//   does not have.
const INLINE_SCRIPT_HASHES = [
  // Layout.astro <script is:inline> language bootstrap. Recompute the
  // sha256-base64 of the exact script body whenever that script changes; a
  // stale hash is harmless while the policy is Report-Only. The other Layout
  // script (i18n bootstrap) is bundled by Astro into an external module, so
  // plain 'self' covers it.
  // NOTE: hash computed over the SERVED bytes (Astro normalizes the inline
  // script whitespace) — verify with: curl -s URL | python3 -c <extract+sha256>.
  // Source-file bytes differ; never recompute from Layout.astro.
  "sha256-v38jv4enDsc6myezEXkjc6fpvrDB7Cd7MIvj2JAQsGo=",
];

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // Hash sources MUST be single-quoted per CSP grammar — bare sha256-... is
  // an invalid source (flagged in console) and silently ignored.
  `script-src 'self' ${INLINE_SCRIPT_HASHES.map((h) => `'${h}'`).join(" ")}`,
  // 'unsafe-inline' only for styles: Tailwind/Svelte emit style attributes and
  // Astro components carry inline style="" attrs (brand gradients, toasts).
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  // The wallet flow is popup-only: nothing on this site may be framed, by us
  // or by anyone else. Embedding merchants load /widget.js as a script, which
  // frame-ancestors does not affect.
  "frame-ancestors 'none'",
].join("; ");

export const onRequest: MiddlewareHandler = async (_context, next) => {
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  // No camera/mic/geolocation and no Payment Request API on this origin;
  // wallet extensions run in their own (exempt) context.
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("content-security-policy-report-only", CONTENT_SECURITY_POLICY);
  // Re-wrap instead of mutating response.headers: keeps this independent of
  // adapter header mutability and preserves streamed bodies as-is.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
