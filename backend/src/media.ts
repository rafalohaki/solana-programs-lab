import { createHash, createHmac } from "node:crypto";
import { Effect, Schema } from "effect";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import nacl from "tweetnacl";
import { base58Decode } from "./widget.js";

// ---------------------------------------------------------------------------
// Media uploads (RustFS / S3) — the write half of the local CDN.
//
// Reads are the public /media/* proxy (frontend, GET-only). Writes go through
// this module so the S3 keys never leave the server and every object is tied
// to a merchant identity:
//
//   PUT /api/media/upload?key=uploads/<merchant>/<name>&contentType=<mime>
//   headers: x-merchant, x-timestamp, x-signature (base58 ed25519 by merchant),
//   x-body-sha256 (hex sha256 of the exact bytes)
//   canonical message v2 (body-bound — v1 without the hash is retired):
//     onchainsub media-put-v2\nmerchant:<m>\nkey:<k>\ntype:<t>\nsha256:<hex>\nts:<ts>
//
// The pipeline is Effect (matching src/schema.ts conventions): Schema v4
// gates first, then a tagged-error Effect program for auth + SigV4 + stream.
// ---------------------------------------------------------------------------

// CONTRACT MIRROR: frontend/src/lib/media.ts duplicates the canonical message,
// ALLOWED_TYPES and MAX bytes (no shared package yet) — change both together.
//
// REMAINING DEBT — window-only auth (±10 min timestamp, no single-use nonce):
// a captured (signature, timestamp, body) triple replays through the window,
// but since v2 binds the body hash, replay can only re-put IDENTICAL bytes
// under the same key (idempotent overwrite — accepted, documented).
// A nonce slot (Redis SET nonce:<val> EX 600 NX) would close even that.
const BUCKET = "media";
const REGION = "us-east-1";
const SERVICE = "s3";
/** 10 MiB upload cap — images/logos only by policy (contentType allowlist). */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Upstream (RustFS) budget per fetch — far below the server idleTimeout, so a
 * hung store answers the mapped 502 instead of stalling into a socket reset. */
const UPSTREAM_TIMEOUT_MS = 5_000;
/** Signature freshness window, mirroring widget.ts (window-only auth is KNOWN
 * DEBT — see the CONTRACT MIRROR note above). */
const SIGNATURE_WINDOW_MS = 10 * 60 * 1000;

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** ed25519 signature decodes to 64 bytes → ~87-88 base58 chars. */
const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{80,100}$/;
const KEY_RE = /^uploads\/[1-9A-HJ-NP-Za-km-z]{32,44}\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

export const mediaApp = new Hono();

// --- Effect Schema gates (shape only; domain checks live below) -------------

const UploadQuerySchema = Schema.Struct({
  key: Schema.String,
  contentType: Schema.String,
});

const UploadHeadersSchema = Schema.Struct({
  merchant: Schema.String,
  timestamp: Schema.String,
  signature: Schema.String,
  bodySha256: Schema.String,
});

type UploadQuery = Schema.Schema.Type<typeof UploadQuerySchema>;
type UploadHeaders = Schema.Schema.Type<typeof UploadHeadersSchema>;

function decodeQuery(raw: Record<string, unknown>): UploadQuery | null {
  const result = Schema.decodeUnknownResult(UploadQuerySchema)(raw);
  return result._tag === "Success" ? result.success : null;
}

function decodeHeaders(raw: Record<string, unknown>): UploadHeaders | null {
  const result = Schema.decodeUnknownResult(UploadHeadersSchema)(raw);
  return result._tag === "Success" ? result.success : null;
}

// --- Tagged errors -----------------------------------------------------------

/**
 * Intentional bare union — a module-local decision, not an oversight: media.ts
 * is a small single-file module and every branch is matched by `_tag` at the
 * single HTTP boundary below. No stack traces or instanceof checks are needed
 * and the shapes stay plain JSON-safe data. Migrate to Data.TaggedError only
 * if the module outgrows this file.
 */
type MediaError =
  | { readonly _tag: "BadQuery"; readonly message: string }
  | { readonly _tag: "Unauthorized"; readonly message: string }
  | { readonly _tag: "TooLarge"; readonly message: string }
  | { readonly _tag: "Upstream"; readonly message: string };

/** One generic 401 for every failed auth check — which check failed stays in
 * the server log only (same pattern as AUTH_FAILED in widget.ts). */
const AUTH_FAILED = "Merchant signature verification failed.";

const fail = (error: MediaError) => Effect.fail(error);

/** Log the specific rejection reason server-side, answer the client with the
 * single generic 401 message. */
function authReject(reason: string): { _tag: "Unauthorized"; message: string } {
  console.error(`[media] auth rejected: ${reason}`);
  return { _tag: "Unauthorized", message: AUTH_FAILED };
}

/**
 * Wrap a fallible thunk: the full error is logged server-side, the client gets
 * the fixed `message` — raw driver/fetch text never leaves the process.
 * `asyncTry` forwards the Effect interruption signal so callers can compose it
 * with their own upstream timeout via AbortSignal.any.
 */
const syncTry = <A>(thunk: () => A, message: string): Effect.Effect<A, MediaError> =>
  Effect.try({
    try: thunk,
    catch: (e) => {
      console.error(`[media] ${message}:`, e);
      return { _tag: "Upstream", message: `${message}.` };
    },
  });

const asyncTry = <A>(thunk: (signal: AbortSignal) => PromiseLike<A>, message: string): Effect.Effect<A, MediaError> =>
  Effect.tryPromise({
    try: (signal) => thunk(signal),
    catch: (e) => {
      console.error(`[media] ${message}:`, e);
      return { _tag: "Upstream", message: `${message}.` };
    },
  });

/** Narrow an unknown rejection to a MediaError — never trust a bare value: a
 * defect reaching this boundary carries no _tag and must not be echoed back. */
function asMediaError(error: unknown): MediaError | null {
  if (error === null || typeof error !== "object") return null;
  const tag = (error as { _tag?: unknown })._tag;
  const message = (error as { message?: unknown }).message;
  if (
    (tag === "BadQuery" || tag === "Unauthorized" || tag === "TooLarge" || tag === "Upstream") &&
    typeof message === "string"
  ) {
    return { _tag: tag, message };
  }
  return null;
}

// --- Domain checks ------------------------------------------------------------

function s3Keys(): { accessKeyId: string; secretAccessKey: string } | null {
  const accessKeyId = process.env.RUSTFS_ACCESS_KEY ?? "";
  const secretAccessKey = process.env.RUSTFS_SECRET_KEY ?? "";
  return accessKeyId === "" || secretAccessKey === "" ? null : { accessKeyId, secretAccessKey };
}

export function mediaStatus(): { enabled: boolean; bucket: string; maxBytes: number } {
  return { enabled: s3Keys() !== null, bucket: BUCKET, maxBytes: MAX_UPLOAD_BYTES };
}

function canonicalMediaMessageV2(merchant: string, key: string, contentType: string, bodySha256Hex: string, timestamp: string): string {
  return `onchainsub media-put-v2\nmerchant:${merchant}\nkey:${key}\ntype:${contentType}\nsha256:${bodySha256Hex}\nts:${timestamp}`;
}

/** Domain check + ed25519 auth, shared by the Effect pipeline. Every failed
 * auth check answers the ONE generic 401 (authReject); the specific reason is
 * only logged, so responses never reveal which check failed. */
function authorize(
  query: UploadQuery,
  headers: UploadHeaders,
): Exclude<MediaError, { _tag: "Upstream" | "TooLarge" }> | { _tag: "ok"; contentType: string; key: string } {
  if (!BASE58_RE.test(headers.merchant)) return authReject("x-merchant must be a base58 address");
  if (!SIG_RE.test(headers.signature)) return authReject("x-signature must be base58 ed25519");
  if (!/^[0-9a-f]{64}$/.test(headers.bodySha256)) return authReject("x-body-sha256 must be hex sha256");
  const ts = Number(headers.timestamp);
  if (!Number.isInteger(ts) || Math.abs(Date.now() - ts) > SIGNATURE_WINDOW_MS) {
    return authReject("x-timestamp outside the acceptance window");
  }
  if (!KEY_RE.test(query.key)) {
    // 400, not 401: the signature may be perfectly valid — the request shape isn't.
    return { _tag: "BadQuery", message: "key must be uploads/<merchant>/<name> with a safe name (no '..')." };
  }
  if (!query.key.startsWith(`uploads/${headers.merchant}/`)) {
    return { _tag: "BadQuery", message: "key must live under uploads/<signing merchant>/." };
  }
  if (!ALLOWED_TYPES.has(query.contentType)) {
    return { _tag: "BadQuery", message: `contentType not allowed (use one of: ${[...ALLOWED_TYPES].join(", ")}).` };
  }
  const message = canonicalMediaMessageV2(headers.merchant, query.key, query.contentType, headers.bodySha256, headers.timestamp);
  const pubkey = base58Decode(headers.merchant);
  const signature = base58Decode(headers.signature);
  const ok = pubkey.length === 32 && signature.length === 64 && nacl.sign.detached.verify(new TextEncoder().encode(message), signature, pubkey);
  return ok ? { _tag: "ok", contentType: query.contentType, key: query.key } : authReject("signature verification failed");
}

// --- SigV4 (header auth, UNSIGNED-PAYLOAD) ------------------------------------

function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** Presign-free SigV4 header auth for a server-side PUT to RustFS. */
function sigV4Headers(method: "PUT" | "DELETE", key: string, contentType: string | undefined): Record<string, string> {
  const cfg = s3Keys();
  if (cfg === null) throw new Error("RUSTFS keys missing");
  const url = new URL(`${(process.env.RUSTFS_URL ?? "http://media:9000").replace(/\/+$/, "")}/${BUCKET}/${key}`);
  const host = url.host;
  const now = new Date();
  const amzDate = `${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, `${dateStamp}/${REGION}/${SERVICE}/aws4_request`, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return {
    host,
    authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${dateStamp}/${REGION}/${SERVICE}/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(contentType !== undefined ? { "content-type": contentType } : {}),
  };
}

// --- Routes --------------------------------------------------------------------

// Route-scoped body limit — the only route that needs it. A fast 413 from the
// content-length header when present, enforced on the actual byte stream
// otherwise; the socket cap (maxRequestBodySize in index.ts) stays the outer
// bound of last resort.
mediaApp.use(
  "/upload",
  bodyLimit({
    maxSize: MAX_UPLOAD_BYTES,
    onError: (c) => c.json({ error: `Upload exceeds ${MAX_UPLOAD_BYTES} bytes.` }, 413),
  }),
);

mediaApp.get("/status", (c) => c.json(mediaStatus()));

mediaApp.put("/upload", async (c) => {
  const query = decodeQuery(c.req.query());
  if (query === null) return c.json({ error: "Query params key and contentType are required." }, 400);
  const headerBag = {
    merchant: c.req.header("x-merchant") ?? "",
    timestamp: c.req.header("x-timestamp") ?? "",
    signature: c.req.header("x-signature") ?? "",
    bodySha256: c.req.header("x-body-sha256") ?? "",
  };
  const headers = decodeHeaders(headerBag);
  if (headers === null) return c.json({ error: "Headers x-merchant, x-timestamp, x-signature and x-body-sha256 are required." }, 400);

  const program: Effect.Effect<{ key: string; url: string }, MediaError> = Effect.gen(function* () {
    const auth = authorize(query, headers);
    if (auth._tag !== "ok") return yield* fail(auth);

    if (s3Keys() === null) {
      return yield* fail({ _tag: "Upstream", message: "Media store is not configured (RUSTFS keys missing)." });
    }

    // Reject oversized uploads BEFORE buffering: trust the socket cap for the
    // real bound (Bun.serve maxRequestBodySize), use the header for a fast 413.
    const declared = Number(c.req.header("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
      return yield* fail({ _tag: "TooLarge", message: `Upload exceeds ${MAX_UPLOAD_BYTES} bytes.` });
    }
    const body = yield* asyncTry(() => c.req.arrayBuffer(), "Failed to read request body");
    if (body.byteLength === 0) return yield* fail({ _tag: "BadQuery", message: "Empty upload body." });
    if (body.byteLength > MAX_UPLOAD_BYTES) {
      return yield* fail({ _tag: "TooLarge", message: `Upload exceeds ${MAX_UPLOAD_BYTES} bytes.` });
    }
    // Body binding: the signed hash must match the received bytes, or a
    // substituted body sails through on a valid signature (admitted debt).
    if (sha256Hex(new Uint8Array(body)) !== headers.bodySha256) {
      return yield* fail(authReject("body hash mismatch") as Exclude<MediaError, { _tag: "Upstream" | "TooLarge" }>);
    }

    const signed = yield* syncTry(() => sigV4Headers("PUT", auth.key, auth.contentType), "Failed to sign S3 request");
    const response = yield* asyncTry(
      (signal) =>
        fetch(`${(process.env.RUSTFS_URL ?? "http://media:9000").replace(/\/+$/, "")}/${BUCKET}/${auth.key}`, {
          method: "PUT",
          headers: { ...signed, "content-length": String(body.byteLength) },
          body: new Uint8Array(body),
          // AbortSignal.any: honor the Effect interruption signal AND cap the
          // upstream wait so a hung RustFS maps to a 502 instead of stalling
          // the route until the server idle timeout resets the socket.
          signal: AbortSignal.any([signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
        }),
      "Media store unreachable",
    );
    if (!response.ok) {
      // Best-effort body read for the SERVER LOG. tryPromise (not Effect.promise):
      // a rejected read (stream reset) becomes a typed failure here — not a
      // defect — so orElseSucceed genuinely recovers it into the "" fallback.
      const detail = yield* Effect.orElseSucceed(
        Effect.tryPromise({
          try: () => response.text(),
          catch: () => ({ _tag: "Upstream" as const, message: `Media store answered HTTP ${response.status}.` }),
        }),
        () => "",
      );
      if (detail !== "") {
        console.error(`[media] upstream answered HTTP ${response.status} for ${auth.key}; body head: ${detail.slice(0, 200)}`);
      }
      // Client sees the status only; upstream body text never leaves the server.
      return yield* fail({ _tag: "Upstream", message: `Media store answered HTTP ${response.status}.` });
    }
    return { key: auth.key, url: `/media/${auth.key}` };
  });

  // A defect must never escape runPromise as a raw value — the rejection
  // handler only understands tagged MediaError, and an untagged value would
  // bypass the status map and leak its internals. Log server-side, re-fail as
  // a generic Upstream so the client gets the mapped response.
  const guarded: Effect.Effect<{ key: string; url: string }, MediaError> = Effect.catchDefect(program, (defect) => {
    console.error("[media] defect for", headers.merchant, query.key, defect);
    return Effect.fail({ _tag: "Upstream", message: "Internal error." });
  });

  return Effect.runPromise(guarded).then(
    (result) => c.json({ ok: true, ...result }, 201),
    (error: unknown) => {
      // Belt and braces: only a value with a confirmed MediaError _tag reaches
      // the client — anything else is logged as a defect and answered 500.
      const mediaError = asMediaError(error);
      if (mediaError === null) {
        console.error("[media] untagged rejection (defect?)", error);
        return c.json({ error: "Internal error." }, 500);
      }
      const status = { BadQuery: 400, Unauthorized: 401, TooLarge: 413, Upstream: 502 }[mediaError._tag] ?? 500;
      return c.json({ error: mediaError.message }, status as 400 | 401 | 413 | 502);
    },
  );
});
