// ---------------------------------------------------------------------------
// Solana Pay transfer-request URL builder. No dependencies, no QR — the slice
// ships links only (wallets open `solana:` URLs natively; QR would need a new
// rendering dependency, which is banned).
//
// Format per https://solana.com/docs/payments/accept-payments/solana-pay
// (transfer request): `solana:<recipient>?amount=<ui-decimal>&label=&message=
// &memo=`. Amount is UI units (decimal string, e.g. 0.1 — never lamports),
// the path segment is the recipient address. Only these five fields: no
// spl-token, no reference — the builder signature is fixed by the slice.
// ---------------------------------------------------------------------------

import { PublicKey } from "@solana/web3.js";

export interface TransferUrlParams {
  /** Merchant wallet, base58. */
  recipient: string;
  /** Amount in UI units (decimal, e.g. 0.1 SOL) — must be a positive number. */
  uiAmount: number;
  label?: string;
  message?: string;
  memo?: string;
}

/**
 * Plain-decimal serializer for the `amount` query param: wallets parse a
 * decimal string, not JS exponential notation (`1e-9`). Non-exponent values
 * pass through untouched.
 */
function formatUiAmount(value: number): string {
  const raw = String(value);
  if (!/[eE]/.test(raw)) return raw;
  const unsigned = raw.startsWith("-") ? raw.slice(1) : raw;
  const [coeff = "", expStr = "0"] = unsigned.split(/[eE]/) as [string, string?];
  const exp = Number.parseInt(expStr ?? "0", 10);
  const [int = "", frac = ""] = coeff.split(".") as [string, string?];
  const digits = `${int}${frac}`;
  const point = int.length + exp;
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${digits}${"0".repeat(point - digits.length)}`;
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * Build a `solana:` transfer-request URL. Throws an English Error on a bad
 * address or amount — the caller catches it and hides the Solana Pay section
 * (no data = empty state, never a fake link).
 */
export function buildTransferUrl(params: TransferUrlParams): string {
  const { recipient, uiAmount, label, message, memo } = params;
  let to: string;
  try {
    to = new PublicKey(recipient).toBase58();
  } catch {
    throw new Error("Invalid Solana Pay recipient: not a valid Solana address.");
  }
  if (typeof uiAmount !== "number" || !Number.isFinite(uiAmount) || uiAmount <= 0) {
    throw new Error("Invalid Solana Pay amount: must be a positive number in UI units.");
  }
  const qs: string[] = [`amount=${formatUiAmount(uiAmount)}`];
  if (label !== undefined && label !== "") qs.push(`label=${encodeURIComponent(label)}`);
  if (message !== undefined && message !== "") qs.push(`message=${encodeURIComponent(message)}`);
  if (memo !== undefined && memo !== "") qs.push(`memo=${encodeURIComponent(memo)}`);
  return `solana:${to}?${qs.join("&")}`;
}
