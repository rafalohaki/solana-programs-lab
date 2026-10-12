import bs58 from "bs58";
import { get } from "svelte/store";
import { signMessage, wallet } from "./wallet.js";

// CONTRACT MIRROR: backend/src/media.ts owns the canonical message, allowed
// MIME types and the size cap — keep both files in sync (no shared package).
//
// STATUS (2026-10-08 audit): this module has NO consumers yet — the merchant
// UI that will call uploadMedia() has not landed. When you wire it up, keep
// the canonical message identical to backend/src/media.ts in the SAME
// changeset as any backend change.
//
// KNOWN DEBT — replay protection: the canonical message carries a timestamp
// but NO single-use nonce, so a captured (signature, timestamp, fields)
// triple can be replayed within the server's acceptance window. Today the
// effect is an idempotent same-key PUT overwrite, but that is an UNWRITTEN
// assumption. The canonical message is FROZEN (changing it requires a full
// migration of both sides). On the next such migration add: a `nonce` field
// to the message, server-side single-use consumption (Redis
// `SET nonce:<val> EX 600 NX` before accepting) — or move to an Anza-style
// SIWS/off-chain message format. Update this mirror in the same changeset.
// ---------------------------------------------------------------------------
// Media uploads → POST-less flow: PUT /api/media/upload (same origin).
// The backend requires an ed25519 signature by the connected merchant over a
// canonical message, then streams the bytes to RustFS (S3) server-side with
// its own keys. Public read lives at /media/<key> (frontend proxy).
// ---------------------------------------------------------------------------

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export interface MediaUploadResult {
  /** Object key, e.g. "uploads/<merchant>/<uuid>.png". */
  key: string;
  /** Same-origin public URL, e.g. "/media/uploads/<merchant>/<uuid>.png". */
  url: string;
}

/** Upload an image bound to the connected merchant wallet. Throws on any failure. */
export async function uploadMedia(file: File): Promise<MediaUploadResult> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type "${file.type || "unknown"}" — use PNG, JPEG, WebP, GIF or AVIF.`);
  }
  if (file.size > MEDIA_MAX_BYTES) {
    throw new Error(`File is too large (max ${Math.floor(MEDIA_MAX_BYTES / (1024 * 1024))} MB).`);
  }
  const address = get(wallet).address?.toBase58();
  if (address === undefined) throw new Error("Connect the merchant wallet first.");

  const key = `uploads/${address}/${crypto.randomUUID()}.${EXT_BY_TYPE[file.type] ?? "bin"}`;
  const timestamp = Date.now().toString();
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const bodySha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const message = new TextEncoder().encode(
    `onchainsub media-put-v2\nmerchant:${address}\nkey:${key}\ntype:${file.type}\nsha256:${bodySha256}\nts:${timestamp}`,
  );
  const signature = await signMessage(message);

  const res = await fetch(
    `/api/media/upload?key=${encodeURIComponent(key)}&contentType=${encodeURIComponent(file.type)}`,
    {
      method: "PUT",
      headers: {
        "x-merchant": address,
        "x-timestamp": timestamp,
        "x-signature": bs58.encode(signature),
        "x-body-sha256": bodySha256,
      },
      body: bytes,
    },
  );
  const json = (await res.json()) as { ok?: boolean; key?: string; url?: string; error?: string };
  if (!res.ok || json.url === undefined || json.key === undefined) {
    throw new Error(json.error ?? `Upload failed (HTTP ${res.status}).`);
  }
  return { key: json.key, url: json.url };
}
