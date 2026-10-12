import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { get, writable } from "svelte/store";
import { connection, decodePlan, findSubscriptionPda, PROGRAM_ID } from "./chain.js";
import { t, tOr } from "./i18n.js";
import "./i18n-app.js";
// The "wallet does not support message signing" error lives in the port2
// dictionary (i18n-app.ts is outside this slice's edit scope) — registering it
// here keeps lookups working for every island that imports the wallet layer.
import "./i18n-port2.js";

// ---------------------------------------------------------------------------
// Minimal wallet layer: Phantom-first, Solflare fallback.
// No wallet-adapter dependency — strict, hand-typed provider surface that
// matches exactly what the Actions flow needs (sign a server-built tx).
// ---------------------------------------------------------------------------

export interface SolanaProvider {
  readonly isPhantom?: boolean;
  readonly publicKey: PublicKey | null;
  readonly isConnected?: boolean;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  /** Accepts legacy AND versioned transactions (server may migrate to v0). */
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  /** Optional: sign arbitrary bytes with ed25519 (widget domain-bind proof).
   * Phantom and Solflare both resolve { signature: Uint8Array }. */
  signMessage?(message: Uint8Array): Promise<{ signature: Uint8Array }>;
  /** Optional event hooks (Phantom/Solflare both emit these). A
   * wallet-standard provider returns an unregister function. */
  on?(event: "accountChanged", handler: (publicKey: PublicKey | null) => void): (() => void) | void;
  on?(event: "disconnect", handler: () => void): (() => void) | void;
  on?(event: string, handler: (...args: unknown[]) => void): (() => void) | void;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
    solflare?: SolanaProvider;
    /** Phantom's namespaced injection — preferred over bare window.solana. */
    phantom?: { solana?: SolanaProvider };
  }
}

export type WalletName = "phantom" | "solflare";
/** A wallet slot also covers the generic unnamed injected provider. */
export type WalletSlot = WalletName | "injected";

interface WalletState {
  name: WalletSlot | null;
  address: PublicKey | null;
  connecting: boolean;
  error: string | null;
  /** Native SOL balance in lamports for the chip (D2 port); null = unknown —
   * the chip then renders the address only, never a made-up number. */
  balanceLamports: number | null;
}

const initialState: WalletState = {
  name: null,
  address: null,
  connecting: false,
  error: null,
  balanceLamports: null,
};

export const wallet = writable<WalletState>(initialState);

// --- provider detection ------------------------------------------------------

function namedProvider(name: WalletName): SolanaProvider | null {
  if (typeof window === "undefined") return null;
  if (name === "phantom") {
    // Slot in ONLY a provider that self-identifies as Phantom — an unnamed
    // window.solana (Solflare also injects one) must never be mislabeled.
    const phantom = window.phantom?.solana;
    if (phantom !== undefined && phantom.isPhantom === true) return phantom;
    if (window.solana?.isPhantom === true) return window.solana;
    return null;
  }
  return window.solflare ?? null;
}

function namedWalletPresent(): boolean {
  return typeof window !== "undefined" && (namedProvider("phantom") !== null || window.solflare !== undefined);
}

function detectProvider(slot: WalletSlot): SolanaProvider | null {
  if (slot !== "injected") return namedProvider(slot);
  // Generic fallback: the bare window.solana provider, only when no named
  // wallet claims it (otherwise it is served under its real name).
  if (typeof window === "undefined" || namedWalletPresent()) return null;
  return window.solana ?? null;
}

export function availableWallets(): WalletSlot[] {
  if (typeof window === "undefined") return [];
  const out: WalletSlot[] = [];
  if (namedProvider("phantom") !== null) out.push("phantom");
  if (window.solflare !== undefined) out.push("solflare");
  if (out.length === 0 && window.solana !== undefined) out.push("injected");
  return out;
}

function slotErrorMessage(slot: WalletSlot): string {
  if (slot === "phantom") return get(t)("wallet.errPhantom");
  if (slot === "solflare") return get(t)("wallet.errSolflare");
  return tOr("wallet.errInjected", "No browser wallet provider detected.");
}

// --- provider event wiring (single source for boot AND explicit connect) ----

let bound: { provider: SolanaProvider; off: Array<() => void> } | null = null;

function unbindProviderEvents(): void {
  for (const off of bound?.off ?? []) {
    try {
      off();
    } catch {
      /* provider already gone */
    }
  }
  bound = null;
}

/**
 * Register accountChanged/disconnect ONCE per active provider (rebinding on
 * every connect drops stale handlers, so an old wallet name can never
 * overwrite state after a wallet switch). accountChanged does NOT blindly
 * adopt the new key: it revalidates trust with a silent onlyIfTrusted
 * connect and falls back to an explicit reconnect when that is refused.
 * (The chip balance is keyed by address and re-derived on every setConnected,
 * so an account switch cannot inherit the previous key's number.)
 */
function bindProviderEvents(slot: WalletSlot, provider: SolanaProvider): void {
  unbindProviderEvents();
  const off: Array<() => void> = [];
  const onAccountChanged = (publicKey: PublicKey | null | undefined): void => {
    if (publicKey === null || publicKey === undefined) {
      wallet.set({ ...initialState, name: slot });
      return;
    }
    provider
      .connect({ onlyIfTrusted: true })
      .then(({ publicKey: pk }) => setConnected(slot, pk))
      .catch(() => {
        // New account is not trusted — force an explicit reconnect instead
        // of silently continuing with a key the user never approved here.
        wallet.set({ ...initialState, name: slot });
      });
  };
  const onDisconnect = (): void => {
    wallet.set({ ...initialState, name: slot });
  };
  const offAccount = provider.on?.("accountChanged", onAccountChanged);
  if (typeof offAccount === "function") off.push(offAccount);
  const offDisconnect = provider.on?.("disconnect", onDisconnect);
  if (typeof offDisconnect === "function") off.push(offDisconnect);
  bound = { provider, off };
}

export async function connectWallet(slot: WalletSlot): Promise<void> {
  const provider = detectProvider(slot);
  if (provider === null) {
    wallet.update((s) => ({ ...s, error: slotErrorMessage(slot) }));
    return;
  }
  wallet.update((s) => ({ ...s, connecting: true, error: null }));
  try {
    const { publicKey } = await provider.connect();
    try {
      localStorage.setItem(STORAGE_KEY, slot);
    } catch {
      /* private mode — session-only connection */
    }
    bindProviderEvents(slot, provider);
    setConnected(slot, publicKey);
  } catch (err) {
    wallet.set({ ...initialState, error: err instanceof Error ? err.message : get(t)("wallet.errRejected") });
  }
}

export async function disconnectWallet(): Promise<void> {
  const state = get(wallet);
  if (state.name !== null) {
    try {
      await detectProvider(state.name)?.disconnect();
    } catch {
      // Best effort — local state is the source of truth for the UI.
    }
  }
  unbindProviderEvents();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  balanceCache = null;
  wallet.set(initialState);
}

// --- Cross-page session restore ---------------------------------------------
// The site is an MPA: every navigation is a full page load and the writable
// store starts empty. Wallets stay authorized to the ORIGIN, so on boot we
// silently reconnect to the persisted provider — `onlyIfTrusted` never pops
// the approval popup (it resolves only for already-trusted sessions).

const STORAGE_KEY = "solhack:wallet";
function setConnected(slot: WalletSlot, publicKey: PublicKey): void {
  wallet.set({ name: slot, address: publicKey, connecting: false, error: null, balanceLamports: null });
  // Every session-establishing path (explicit connect, silent restore,
  // accountChanged) lands here → the chip balance always follows the ACTIVE
  // address. A switch to an unseen address must bypass the 30 s cache.
  void refreshWalletBalance(balanceCache?.address !== publicKey.toBase58());
}

// --- Wallet chip balance (Stitch D2 port) ------------------------------------

/**
 * Native SOL for the header chip, fetched over the SAME origin proxy as every
 * other read: the browser branch of RPC_ENDPOINT is always `/api/rpc`, so this
 * is a plain `getBalance` JSON-RPC POST to our backend (failover + rate limit
 * included). 30 s client cache so the chip does not re-charge the proxy budget
 * on every island remount; accountChanged always bypasses it (see setConnected).
 */
const BALANCE_TTL_MS = 30_000;
let balanceCache: { address: string; lamports: number; at: number } | null = null;
/** Concurrent islands share one in-flight fetch instead of racing the cache. */
let balanceInflight: Promise<number | null> | null = null;

/** Push a resolved balance into the store — but only while it still belongs to
 * the connected address (a stale reply must never label a switched account). */
function publishBalance(addressKey: string, lamports: number | null): void {
  wallet.update((s) =>
    s.address !== null && s.address.toBase58() === addressKey ? { ...s, balanceLamports: lamports } : s,
  );
}

async function fetchSolBalance(pubkey: PublicKey): Promise<number | null> {
  const conn = connection();
  try {
    return await conn.getBalance(pubkey, "confirmed");
  } catch {
    // getAccountInfo is equally allowlisted and reports the same lamports —
    // fallback preserves the chip whenever getBalance is unavailable.
  }
  try {
    // getAccountInfo IS allowlisted and returns the account's lamports — the
    // same number getBalance reports for the wallet's own system account.
    // No account on-chain == 0 lamports, exactly what getBalance would say.
    const info = await conn.getAccountInfo(pubkey);
    return info?.lamports ?? 0;
  } catch {
    return null; // unreadable → chip hides the balance (no fake number)
  }
}

/**
 * Refresh the chip balance for the connected wallet. Reads through the 30 s
 * cache when `force` is false and the address matches; publishes whatever it
 * resolved (a failed refresh clears the stale value instead of keeping it).
 */
export async function refreshWalletBalance(force = false): Promise<number | null> {
  const state = get(wallet);
  if (state.name === null || state.address === null) return null;
  const addressKey = state.address.toBase58();
  const now = Date.now();
  const cached = balanceCache;
  if (!force && cached !== null && cached.address === addressKey && now - cached.at < BALANCE_TTL_MS) {
    publishBalance(addressKey, cached.lamports);
    return cached.lamports;
  }
  if (balanceInflight !== null) return balanceInflight;
  balanceInflight = fetchSolBalance(state.address)
    .then((lamports) => {
      if (lamports !== null) balanceCache = { address: addressKey, lamports, at: Date.now() };
      publishBalance(addressKey, lamports);
      return lamports;
    })
    .catch(() => null)
    .finally(() => {
      balanceInflight = null;
    });
  return balanceInflight;
}

/**
 * Wait for a late-injected provider: a one-shot retry on window `load` plus
 * a short 200 ms poll (~2 s total). Extension content scripts can inject
 * AFTER this module runs (cold start, slow devices) — this delays the
 * "wallet vanished" verdict so a trusted user is never logged out early.
 */
function waitForProvider(slot: WalletSlot): Promise<SolanaProvider | null> {
  return new Promise((resolve) => {
    let pollsLeft = 10;
    let timer: ReturnType<typeof setInterval> | null = null;
    const finish = (provider: SolanaProvider | null): void => {
      if (timer !== null) clearInterval(timer);
      window.removeEventListener("load", onLoad);
      resolve(provider);
    };
    const onLoad = (): void => {
      const provider = detectProvider(slot);
      if (provider !== null) finish(provider);
    };
    const poll = (): void => {
      const provider = detectProvider(slot);
      if (provider !== null) {
        finish(provider);
        return;
      }
      pollsLeft -= 1;
      if (pollsLeft <= 0) finish(null);
    };
    if (document.readyState !== "complete") window.addEventListener("load", onLoad, { once: true });
    timer = setInterval(poll, 200);
  });
}

/** Silent onlyIfTrusted restore for one slot; drops the stored name when the
 * origin is not trusted (or the provider refuses). */
async function restoreSession(slot: WalletSlot, provider: SolanaProvider): Promise<void> {
  wallet.update((s) => ({ ...s, name: slot, connecting: true }));
  // Live updates while the page is open.
  bindProviderEvents(slot, provider);
  // Already connected inside the provider → restore without any prompt.
  if (provider.isConnected === true && provider.publicKey !== null) {
    setConnected(slot, provider.publicKey);
    return;
  }
  try {
    const { publicKey } = await provider.connect({ onlyIfTrusted: true });
    setConnected(slot, publicKey);
  } catch {
    unbindProviderEvents();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    wallet.set(initialState);
  }
}

if (typeof window !== "undefined") {
  const stored = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw === "phantom" || raw === "solflare" || raw === "injected" ? raw : null;
    } catch {
      return null;
    }
  })();

  if (stored !== null) {
    const provider = detectProvider(stored);
    if (provider !== null) {
      void restoreSession(stored, provider);
    } else {
      // Provider not injected YET — defer the verdict (see waitForProvider).
      void waitForProvider(stored).then((late) => {
        if (late !== null) {
          void restoreSession(stored, late);
          return;
        }
        // Wallet truly vanished (different browser/profile) — forget it.
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      });
    }
  }
}

// --- Message signing (widget domain-bind proof) ------------------------------

/**
 * Ask the connected wallet to sign arbitrary bytes with ed25519 — used for the
 * merchant signature on the widget domain-bind message. Phantom and Solflare
 * resolve { signature: Uint8Array }. Throws a readable error when no wallet is
 * connected, the provider vanished, or the provider lacks signMessage support.
 */
export async function signMessage(message: Uint8Array): Promise<Uint8Array> {
  const state = get(wallet);
  if (state.name === null || state.address === null) throw new Error(get(t)("wallet.errConnectFirst"));
  const provider = detectProvider(state.name);
  if (provider === null) throw new Error(get(t)("wallet.errProviderGone"));
  if (typeof provider.signMessage !== "function") throw new Error(get(t)("wallet.errSignMessage"));
  const { signature } = await provider.signMessage(message);
  return signature;
}

// --- Actions flow ------------------------------------------------------------

/** POST body shared by every Actions endpoint. */
interface ActionPostBody {
  account: string;
}

/** Successful Actions transaction response (spec §POST). */
export interface ActionTxResponse {
  transaction: string;
  message?: string;
  links?: unknown;
  /**
   * Blockhash validity bound, when the server includes it (spec extension).
   * Drives the expiry check after a confirmation timeout — without it a
   * slow-landing tx and an expired blockhash are indistinguishable.
   */
  lastValidBlockHeight?: number;
}

interface ActionErrorResponse {
  error?: string;
  message?: string;
}
export async function postAction(
  endpoint: string,
  account: PublicKey,
  extra?: Record<string, unknown>,
): Promise<ActionTxResponse> {
  const body: ActionPostBody & Record<string, unknown> = { account: account.toBase58(), ...extra };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as ActionTxResponse & ActionErrorResponse;
  if (!res.ok) throw new Error(json.message ?? json.error ?? `Actions HTTP ${res.status}`);
  if (typeof json.transaction !== "string" || json.transaction.length === 0) {
    throw new Error(json.message ?? json.error ?? get(t)("wallet.errNoTransaction"));
  }
  return {
    transaction: json.transaction,
    message: json.message,
    links: json.links,
    lastValidBlockHeight:
      typeof json.lastValidBlockHeight === "number" ? json.lastValidBlockHeight : undefined,
  };
}

// --- transaction decoding + blind-signing guard ------------------------------

/**
 * Decode server-provided transaction bytes. Tries the versioned deserializer
 * first (it parses BOTH v0 and legacy wire format), falling back to the
 * legacy Transaction — so a future server-side v0/ALT migration cannot brick
 * every client at once with "Versioned messages must be deserialized…".
 */
export function decodeTx(bytes: Uint8Array): Transaction | VersionedTransaction {
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

/** Programs allowed in a server-built transaction we are asked to sign. */
const ALLOWED_PROGRAM_IDS: string[] = [
  SystemProgram.programId.toBase58(), // PDA creation / lamport moves
  TOKEN_PROGRAM_ID.toBase58(), // approve / revoke
  ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), // ATA creation
  PROGRAM_ID.toBase58(), // the subscriptions program itself
];

/** spl-token instruction type code for Approve (TokenInstruction.Approve = 4,
 * data = [u8 type][u64le amount]) — per @solana/spl-token sources. */
const APPROVE_INSTRUCTION_CODE = 4;

interface TxInspection {
  feePayer: PublicKey | null;
  instructions: Array<{ programId: PublicKey | null; accounts: Array<PublicKey | null>; data: Uint8Array }>;
}

/**
 * Uniform view over legacy and versioned transactions. Static account keys
 * cover every instruction of our server-built txs; an index beyond the
 * static range means an ALT lookup the client cannot resolve → null (and
 * the safety assert rejects it).
 */
function inspectTx(tx: Transaction | VersionedTransaction): TxInspection {
  if (tx instanceof VersionedTransaction) {
    const keys = tx.message.staticAccountKeys;
    const resolve = (index: number): PublicKey | null => (index < keys.length ? keys[index] ?? null : null);
    return {
      feePayer: keys[0] ?? null,
      instructions: tx.message.compiledInstructions.map((ix) => ({
        programId: resolve(ix.programIdIndex),
        accounts: ix.accountKeyIndexes.map(resolve),
        data: ix.data,
      })),
    };
  }
  return {
    feePayer: tx.feePayer ?? null,
    instructions: tx.instructions.map((ix) => ({
      programId: ix.programId,
      accounts: ix.keys.map((meta) => meta.pubkey),
      data: ix.data,
    })),
  };
}

/**
 * Blind-signing guard (fail closed): inspect a server-built transaction
 * BEFORE the wallet popup. Asserts the fee payer is the connected wallet and
 * every instruction targets a known program; when the tx approves a SPL
 * delegate, the delegate must be THIS wallet's subscription PDA for the plan
 * it references and the allowance must not exceed the plan's on-chain amount.
 * Exported for the popup-checkout flow (pay-checkout.ts), which signs outside
 * signAndSendAction.
 */
export async function assertTxSafe(tx: Transaction | VersionedTransaction, payer: PublicKey): Promise<void> {
  const insp = inspectTx(tx);
  if (insp.feePayer === null || !insp.feePayer.equals(payer)) {
    throw new Error(tOr("wallet.errNotFeePayer", "Transaction fee payer does not match the connected wallet."));
  }
  for (const ix of insp.instructions) {
    const programId = ix.programId?.toBase58() ?? null;
    if (programId === null || !ALLOWED_PROGRAM_IDS.includes(programId)) {
      throw new Error(
        tOr(
          "wallet.errUnknownProgram",
          `Transaction contains an instruction for an unknown program (${programId ?? "address-table key"}).`,
        ),
      );
    }
  }
  const approve = insp.instructions.find(
    (ix) => ix.programId?.equals(TOKEN_PROGRAM_ID) === true && ix.data[0] === APPROVE_INSTRUCTION_CODE,
  );
  if (approve === undefined) return; // no delegate in this tx → nothing else to verify

  // SPL approve layout: accounts = [source, delegate, owner].
  const delegate = approve.accounts[1];
  const owner = approve.accounts[2];
  if (owner == null || !owner.equals(payer)) {
    throw new Error(tOr("wallet.errNotFeePayer", "Transaction approve does not act for the connected wallet."));
  }
  // The only program ix paired with an approve is `subscribe` (8-byte
  // discriminator-only data): accounts = [subscriber, plan, subscriptionPda].
  const subscribeIx = insp.instructions.find(
    (ix) => ix.programId?.equals(PROGRAM_ID) === true && ix.data.length === 8,
  );
  const plan = subscribeIx?.accounts[1];
  if (subscribeIx === undefined || delegate == null || plan == null) {
    throw new Error(tOr("wallet.errUnexpectedShape", "Unexpected approve/subscribe shape — transaction rejected."));
  }
  const [expectedPda] = findSubscriptionPda(plan, payer);
  if (!delegate.equals(expectedPda)) {
    throw new Error(
      tOr("wallet.errBadDelegate", "Approve delegate is not this subscription's program PDA."),
    );
  }
  const allowance = new DataView(
    approve.data.buffer,
    approve.data.byteOffset,
    approve.data.byteLength,
  ).getBigUint64(1, true);
  const planInfo = await connection().getAccountInfo(plan);
  const decoded = planInfo === null ? null : decodePlan(plan, new Uint8Array(planInfo.data));
  if (decoded === null) {
    throw new Error(tOr("wallet.errPlanUnreadable", "Could not read the plan on-chain — transaction not signed."));
  }
  if (allowance > decoded.amount) {
    throw new Error(
      tOr(
        "wallet.errAllowanceTooHigh",
        `Approve allowance exceeds the plan amount (${decoded.amount.toString()} raw units).`,
      ),
    );
  }
}

/**
 * Full wallet round-trip for an Actions endpoint: build (server) → assert →
 * sign → send (wallet) → confirm. Returns the signature.
 */
export async function signAndSendAction(
  endpoint: string,
  extra?: Record<string, unknown>,
): Promise<{ signature: string; message?: string }> {
  const state = get(wallet);
  if (state.name === null || state.address === null) throw new Error(get(t)("wallet.errConnectFirst"));
  const provider = detectProvider(state.name);
  if (provider === null) throw new Error(get(t)("wallet.errProviderGone"));

  const { transaction: base64, message, lastValidBlockHeight } = await postAction(endpoint, state.address, extra);
  const txBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const tx = decodeTx(txBytes);
  await assertTxSafe(tx, state.address);
  const signed = await provider.signTransaction(tx);
  const raw = signed.serialize();
  const conn = connection();
  const signature = await conn.sendRawTransaction(raw, { skipPreflight: false });
  await confirmSignature(conn, signature, { raw, lastValidBlockHeight });
  return { signature, message };
}

// --- confirmation ------------------------------------------------------------

export interface ConfirmOptions {
  /** Overall deadline in ms (default 60 s). */
  deadlineMs?: number;
  /** Serialized transaction bytes — enables idempotent rebroadcast retries. */
  raw?: Uint8Array;
  /** Server-provided blockhash bound — enables the expiry check. */
  lastValidBlockHeight?: number;
}

/** Rebroadcast the same bytes at ~25 s and ~45 s while waiting. */
const REBROADCAST_AT_MS = [25_000, 45_000];
/** Ask for full transaction history once, past this point. */
const SEARCH_HISTORY_AFTER_MS = 30_000;

/**
 * THE confirmation loop — every signing flow uses this single helper (wallet
 * round-trip, popup checkout, manage panel). Polls getSignatureStatuses with
 * a 1 s→2 s→4 s backoff capped at 5 s, requests searchTransactionHistory
 * once past the halfway mark (a null status may mean a pruned transaction),
 * rebroadcasts the same signed bytes (idempotent — same signature) while the
 * blockhash is plausibly valid, and distinguishes expiry from slow landing
 * via lastValidBlockHeight when the server provides it.
 */
export async function confirmSignature(
  conn: Connection,
  signature: string,
  opts: ConfirmOptions = {},
): Promise<void> {
  const deadline = Date.now() + (opts.deadlineMs ?? 60_000);
  const startedAt = Date.now();
  const expired = tOr(
    "wallet.errBlockhashExpired",
    "The transaction's blockhash expired before it landed — rebuild the transaction and try again.",
  );
  let waitMs = 1_000;
  let rebroadcasts = 0;
  let searched = false;
  for (;;) {
    // A poll that throws (transport blip, or an upstream rejecting the
    // search-history shape) must not fail a landed transaction: fall through
    // to waiting. Past the halfway mark, confirm via the tx itself instead —
    // statuses prune fast and some RPCs reject search-history outright.
    let status: { confirmationStatus?: string; err?: unknown } | null | undefined;
    try {
      const search = !searched && Date.now() - startedAt > SEARCH_HISTORY_AFTER_MS;
      const { value } = await conn.getSignatureStatuses([signature], { searchTransactionHistory: search });
      if (search) searched = true;
      status = value[0] ?? null;
    } catch {
      status = null;
    }
    if (status === null && Date.now() - startedAt > SEARCH_HISTORY_AFTER_MS) {
      try {
        const tx = await conn.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
        const txErr = tx?.meta?.err ?? null;
        if (tx !== null && txErr === null) return;
        if (txErr !== null && txErr !== undefined) {
          throw new Error(`${get(t)("wallet.errTxRejected")}: ${JSON.stringify(txErr)}`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith(get(t)("wallet.errTxRejected"))) throw e;
        /* treat like a null status — keep waiting */
      }
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    const err = status?.err;
    if (err !== null && err !== undefined) {
      throw new Error(`${get(t)("wallet.errTxRejected")}: ${JSON.stringify(err)}`);
    }
    // Same-signature resend while the blockhash is plausibly still valid —
    // a dropped send costs one idempotent extra push (maxRetries: 0).
    const rebroadcastAtMs = REBROADCAST_AT_MS[rebroadcasts];
    if (opts.raw !== undefined && rebroadcastAtMs !== undefined && Date.now() - startedAt > rebroadcastAtMs) {
      try {
        await conn.sendRawTransaction(opts.raw, { skipPreflight: false, maxRetries: 0 });
      } catch {
        /* transport hiccup or preflight reject — the deadline path reports it */
      }
      rebroadcasts += 1;
    }
    if (Date.now() > deadline) {
      if (opts.lastValidBlockHeight !== undefined) {
        const height = await conn.getBlockHeight().catch(() => null);
        if (height !== null && height > opts.lastValidBlockHeight) throw new Error(expired);
      }
      throw new Error(get(t)("wallet.errConfirmTimeout"));
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, waitMs);
    await promise;
    waitMs = Math.min(waitMs * 2, 5_000);
  }
}
