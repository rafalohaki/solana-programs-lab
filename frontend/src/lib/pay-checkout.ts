import { assertTxSafe, confirmSignature, decodeTx, type SolanaProvider } from "./wallet.js";
import { connection } from "./chain.js";
import { tOr } from "./i18n.js";
import "./i18n-pay.js";

// ---------------------------------------------------------------------------
// Popup-checkout client for /pay. Mirrors the signAndSendAction pattern from
// wallet.ts: POST the Actions endpoint (server builds the unsigned tx) →
// assert (blind-signing guard) → sign in the page's wallet → send + confirm
// via the SHARED confirmSignature helper (single copy in wallet.ts).
// Kept as a plain lib module (not a Svelte component) so pay.astro's inline
// script stays a 2-line import — astro check typechecks inline scripts
// strictly.
// Opener notifications go ONLY to the server-validated ?host= origin (the
// SSR gate renders the checkout card after /api/widget/check allowed that
// host) — never with targetOrigin "*"; with no host we skip notifying.
// Canonical messages (solhack:paid / solhack:closed) are untouched; the
// receiver widget.js filters event.origin itself.
// On success the opener is notified and the popup closes itself; closing
// without paying notifies `solhack:closed` via the pagehide handler.
// ---------------------------------------------------------------------------

function provider(): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  return window.solana ?? window.solflare ?? null;
}

function setStatus(text: string, isError: boolean): void {
  const el = document.getElementById("pay-status");
  if (el === null) return;
  el.textContent = text;
  el.style.color = isError ? "#fda4af" : "rgba(255,255,255,0.6)";
}

/** Resolve a pay.status.* key with inline-EN fallback and {param} filling. */
function status(key: string, fallbackEn: string, params?: Record<string, string>): string {
  const template = tOr(key, fallbackEn);
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}

/**
 * Validated opener target: `https://<host>` from the ?host= param. That host
 * was validated by the SSR gate (/api/widget/check) BEFORE this card was
 * rendered, so it is a trustworthy origin for the opener. Returns null (and
 * skips the notification entirely) when the param is missing or malformed.
 */
function openerTarget(): string | null {
  const host = new URLSearchParams(window.location.search).get("host");
  if (host === null || host === "" || /[/@\s]/.test(host)) return null;
  return `https://${host}`;
}

function notifyOpener(message: { type: "solhack:paid" | "solhack:closed"; signature?: string }): void {
  try {
    if (window.opener === null) return;
    const target = openerTarget();
    if (target === null) return;
    window.opener.postMessage(message, target);
  } catch {
    /* opener gone */
  }
}

let paid = false;

function notifyClosed(): void {
  if (paid) return;
  notifyOpener({ type: "solhack:closed" });
}

async function connect(): Promise<void> {
  const p = provider();
  if (p === null) {
    setStatus(status("pay.status.noWallet", "No wallet found — install Phantom or Solflare."), true);
    return;
  }
  try {
    const { publicKey } = await p.connect();
    setStatus(
      status("pay.status.connected", "Connected: {address}", { address: `${publicKey.toBase58().slice(0, 8)}…` }),
      false,
    );
  } catch (err) {
    setStatus(
      err instanceof Error ? err.message : status("pay.status.rejected", "Connection rejected."),
      true,
    );
  }
}

async function subscribe(btn: HTMLButtonElement): Promise<void> {
  const p = provider();
  if (p === null) {
    setStatus(status("pay.status.noWalletSub", "No wallet found — install Phantom or Solflare first."), true);
    return;
  }
  const endpoint = btn.dataset.endpoint ?? "";
  if (endpoint === "") {
    setStatus(status("pay.status.misconfigured", "Checkout misconfigured (no endpoint)."), true);
    return;
  }
  btn.disabled = true;
  try {
    const connected = p.publicKey ?? (await p.connect()).publicKey;
    setStatus(status("pay.status.building", "Building transaction…"), false);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: connected.toBase58() }),
    });
    const json = (await res.json()) as {
      transaction?: unknown;
      message?: unknown;
      error?: unknown;
      lastValidBlockHeight?: unknown;
    };
    if (!res.ok) {
      const msg =
        typeof json.message === "string"
          ? json.message
          : typeof json.error === "string"
            ? json.error
            : `Actions HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (typeof json.transaction !== "string" || json.transaction.length === 0) {
      throw new Error("Action returned no transaction.");
    }
    const bytes = Uint8Array.from(atob(json.transaction), (c) => c.charCodeAt(0));
    const tx = decodeTx(bytes);
    // Blind-signing guard: fee payer, program allowlist, delegate + allowance.
    await assertTxSafe(tx, connected);
    const signed = await p.signTransaction(tx);
    const raw = signed.serialize();
    const conn = connection();
    setStatus(status("pay.status.sending", "Sending… confirm in your wallet."), false);
    const signature = await conn.sendRawTransaction(raw, { skipPreflight: false });
    await confirmSignature(conn, signature, {
      raw,
      lastValidBlockHeight:
        typeof json.lastValidBlockHeight === "number" ? json.lastValidBlockHeight : undefined,
    });
    paid = true;
    notifyOpener({ type: "solhack:paid", signature });
    setStatus(status("pay.status.paid", "Paid: {signature}", { signature }), false);
    window.close();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : status("pay.status.failed", "Subscription failed."), true);
    btn.disabled = false;
  }
}

/** Wire the /pay buttons. Safe to call once per page load. */
export function initPayCheckout(): void {
  // pagehide (not unload) — fires reliably across bfcache and modern Chrome.
  window.addEventListener("pagehide", notifyClosed);
  document.getElementById("pay-connect")?.addEventListener("click", () => {
    void connect();
  });
  const subBtn = document.getElementById("pay-subscribe");
  if (subBtn instanceof HTMLButtonElement) {
    // subscribe() disables the button synchronously on entry (single-flight).
    subBtn.addEventListener("click", () => {
      void subscribe(subBtn);
    });
  }
}
