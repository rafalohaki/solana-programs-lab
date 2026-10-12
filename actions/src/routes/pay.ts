import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { DEFAULT_ICON, rpcEndpointFor } from "../config.js";
import { badRequest, jsonResponse, optionsResponse } from "../cors.js";
import { ataForOwner, buildUnsignedTx, parseAddress } from "../solana.js";

/**
 * GET /api/actions/pay?merchant=<pk>&amount=<base units>&mint=<pk optional>&label=<txt>&memo=<txt>
 * POST same shape, body: { account } (the paying wallet).
 *
 * One-time payment = a PLAIN transfer the paying wallet signs itself:
 * - no mint  → SystemProgram.transfer (payer → merchant, lamports);
 * - with mint→ SPL transferChecked (payer ATA → merchant ATA). The merchant
 *   ATA is created idempotently in the same transaction when missing, with
 *   the PAYER as the rent funder — same "create-if-needed" pattern as the
 *   subscription charge route (which passes ASSOCIATED_TOKEN_PROGRAM_ID to
 *   the program). Decimals are read from the mint account on-chain, never
 *   trusted from the URL (transferChecked verifies them against the mint).
 *
 * NO delegation and NO subscriptions-program instruction: the server builds
 * an unsigned transaction and the wallet is the only signer. Structure and
 * CORS mirror routes/plan.ts 1:1.
 */
export { optionsResponse as OPTIONS };

/** Merchant-chosen display label — printable, bounded (reaches Blink cards). */
const LABEL_RE = /^[^\u0000-\u001f\u007f]{1,120}$/;
/** Optional memo — printable, bounded (reaches metadata description + record). */
const MEMO_RE = /^[^\u0000-\u001f\u007f]{1,200}$/;

/** Mint layout: COption<Pubkey> authority (36) + u64 supply (8) → decimals @ 44. */
const MINT_DECIMALS_OFFSET = 44;

/** Read the mint's decimals from the cluster (fail-closed: no account or a
 *  non-token owner is an error, never a guessed default). */
async function fetchMintDecimals(rpcEndpoint: string, mint: PublicKey): Promise<number> {
  const connection = new Connection(rpcEndpoint, "confirmed");
  const info = await connection.getAccountInfo(mint);
  if (info === null || !info.owner.equals(TOKEN_PROGRAM_ID) || info.data.length <= MINT_DECIMALS_OFFSET) {
    throw new Error(`Mint ${mint.toBase58()} has no readable SPL token account on this cluster.`);
  }
  return info.data[MINT_DECIMALS_OFFSET] ?? 0;
}

/** Validate an optional printable query param; null when absent, throws when malformed. */
function parseOptionalText(raw: string | null, name: string, re: RegExp, maxLen: number): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!re.test(trimmed)) throw new Error(`Query param ${name} must be printable text (max ${maxLen} chars).`);
  return trimmed;
}

/** Base-units amount from the query: positive integer, u64-bounded. */
function parseAmount(raw: string | null): bigint | null {
  if (raw === null) return null;
  try {
    const v = BigInt(raw);
    return v > 0n && v <= 0xffff_ffff_ffff_ffffn ? v : null;
  } catch {
    return null;
  }
}

export async function handlePayGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const q = (k: string, fb: string): string => url.searchParams.get(k) ?? fb;
  const base = `${url.origin}${url.pathname}`;
  const memo = url.searchParams.get("memo");
  const description =
    memo !== null && memo.trim() !== ""
      ? `One-time payment. Memo: ${memo.trim()}`
      : "One-time payment — a direct transfer you sign in your wallet. No delegate, no subscription.";
  return jsonResponse({
    type: "action",
    icon: DEFAULT_ICON,
    title: "One-time payment",
    description,
    label: q("label", "Pay now"),
    links: {
      actions: [
        {
          label: q("label", "Pay now"),
          href:
            `${base}?merchant=${q("merchant", "{merchant}")}` +
            `&amount=${q("amount", "{amount}")}&mint=${q("mint", "{mint}")}` +
            `&label=${q("label", "")}&memo=${q("memo", "")}`,
          parameters: [
            { name: "merchant", label: "Merchant address" },
            { name: "amount", label: "Amount (base units)" },
            { name: "mint", label: "Token mint (empty = native SOL)" },
            { name: "label", label: "Display label" },
            { name: "memo", label: "Memo" },
          ],
        },
      ],
    },
  });
}

export async function handlePayPost(req: Request): Promise<Response> {
  let body: { account?: string };
  try {
    body = (await req.json()) as { account?: string };
  } catch {
    return badRequest("Invalid JSON body; expected { account }.");
  }
  const url = new URL(req.url);
  let payer: PublicKey;
  let merchant: PublicKey;
  let mint: PublicKey | null;
  try {
    payer = parseAddress(body.account ?? null, "account");
    merchant = parseAddress(url.searchParams.get("merchant"), "merchant");
    const mintRaw = url.searchParams.get("mint");
    mint = mintRaw === null || mintRaw.trim() === "" ? null : parseAddress(mintRaw, "mint");
  } catch (e) {
    return badRequest((e as Error).message);
  }
  const amount = parseAmount(url.searchParams.get("amount"));
  if (amount === null) {
    return badRequest("Query param amount must be a positive integer in base units (u64).");
  }
  let label: string | null;
  let memo: string | null;
  try {
    label = parseOptionalText(url.searchParams.get("label"), "label", LABEL_RE, 120);
    memo = parseOptionalText(url.searchParams.get("memo"), "memo", MEMO_RE, 200);
  } catch (e) {
    return badRequest((e as Error).message);
  }
  if (payer.equals(merchant)) {
    return badRequest("Payer and merchant must differ.");
  }

  const cluster = url.searchParams.get("cluster") ?? "devnet";
  const rpcEndpoint = rpcEndpointFor(cluster);

  const instructions: TransactionInstruction[] = [];
  let units: string;
  if (mint === null) {
    // Native SOL: a plain SystemProgram.transfer — no ATA, no decimals read.
    instructions.push(
      SystemProgram.transfer({ fromPubkey: payer, toPubkey: merchant, lamports: amount }),
    );
    units = "lamports (SOL)";
  } else {
    const sourceAta = ataForOwner(payer, mint);
    const destinationAta = getAssociatedTokenAddressSync(
      mint,
      merchant,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    try {
      const decimals = await fetchMintDecimals(rpcEndpoint, mint);
      instructions.push(
        // Create-if-needed: no-op when the merchant ATA already exists.
        createAssociatedTokenAccountIdempotentInstruction(payer, destinationAta, merchant, mint),
        createTransferCheckedInstruction(
          sourceAta,
          mint,
          destinationAta,
          payer,
          amount,
          decimals,
          [],
          TOKEN_PROGRAM_ID,
        ),
      );
    } catch (e) {
      return badRequest(`Could not read the mint on-chain: ${(e as Error).message}`);
    }
    units = `base units of ${mint.toBase58()}`;
  }

  try {
    const transaction = await buildUnsignedTx(rpcEndpoint, payer, instructions);
    const suffix = memo !== null ? ` Memo: ${memo}` : "";
    return jsonResponse({
      type: "transaction",
      transaction,
      message: `Pay ${amount.toString()} ${units} to ${merchant.toBase58()}.${suffix}`,
    });
  } catch (e) {
    return jsonResponse({ error: `Failed to build transaction: ${(e as Error).message}` }, { status: 502 });
  }
}

export const GET = handlePayGet;
export const POST = handlePayPost;
