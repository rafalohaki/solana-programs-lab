import { PublicKey } from "@solana/web3.js";
import { DEFAULT_ICON, rpcEndpointFor } from "../config.js";
import { badRequest, jsonResponse, optionsResponse } from "../cors.js";
import {
  buildUnsignedTx,
  createInvoiceIx,
  findInvoicePda,
  parseAddress,
  parseProgramId,
} from "../solana.js";

/**
 * GET /api/actions/invoice?plan=<plan>&subscription=<sub>&invoiceId=<n>&memo=<hex64>
 * POST same shape, body: { account } (merchant).
 *
 * POST builds one create_invoice instruction for the derived Invoice PDA
 * [b"invoice", subscription, invoice_id LE8]. `memo` is 64 hex chars = sha256
 * over the off-chain invoice metadata (buyer, BoL / line items, dates).
 * Server never signs; the merchant wallet does.
 */
export { optionsResponse as OPTIONS };

function parseMemoHex(value: string | null): Uint8Array {
  if (value === null || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("Query param memo must be 64 hex chars (sha256 of the invoice metadata).");
  }
  return Uint8Array.from(Buffer.from(value, "hex"));
}

export async function handleInvoiceGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const plan = url.searchParams.get("plan") ?? "{plan}";
  const subscription = url.searchParams.get("subscription") ?? "{subscription}";
  const invoiceId = url.searchParams.get("invoiceId") ?? "{invoiceId}";
  const memo = url.searchParams.get("memo") ?? "{memoHex}";
  const cluster = url.searchParams.get("cluster") ?? "devnet";
  const base = `${url.origin}${url.pathname}`;
  return jsonResponse({
    title: "Create invoice",
    icon: DEFAULT_ICON,
    description:
      "Merchant creates a verifiable invoice for one subscription period. The memo hash pins the off-chain metadata on-chain.",
    label: "Create invoice",
    links: {
      actions: [
        {
          label: "Create invoice",
          href: `${base}?plan=${plan}&subscription=${subscription}&invoiceId=${invoiceId}&memo=${memo}&cluster=${cluster}`,
        },
      ],
    },
  });
}

export async function handleInvoicePost(req: Request): Promise<Response> {
  let body: { account?: string };
  try {
    body = (await req.json()) as { account?: string };
  } catch {
    return badRequest("Invalid JSON body; expected { account }.");
  }
  let merchant: PublicKey;
  try {
    merchant = parseAddress(body.account ?? null, "account");
  } catch (e) {
    return badRequest((e as Error).message);
  }

  const url = new URL(req.url);
  let plan: PublicKey;
  let subscription: PublicKey;
  try {
    plan = parseAddress(url.searchParams.get("plan"), "plan");
    subscription = parseAddress(url.searchParams.get("subscription"), "subscription");
  } catch (e) {
    return badRequest((e as Error).message);
  }

  const rawId = url.searchParams.get("invoiceId") ?? "";
  let invoiceId: bigint;
  try {
    invoiceId = BigInt(rawId);
    if (invoiceId < 0n) throw new Error("negative");
  } catch {
    return badRequest("Query param invoiceId must be a non-negative integer.");
  }

  let memo: Uint8Array;
  try {
    memo = parseMemoHex(url.searchParams.get("memo"));
  } catch (e) {
    return badRequest((e as Error).message);
  }

  const programId = parseProgramId(url);
  const cluster = url.searchParams.get("cluster") ?? "devnet";
  const [invoicePda] = findInvoicePda(subscription, invoiceId, programId);

  let transaction: string;
  try {
    transaction = await buildUnsignedTx(rpcEndpointFor(cluster), merchant, [
      createInvoiceIx(merchant, plan, subscription, invoicePda, invoiceId, memo, programId),
    ]);
  } catch (e) {
    return jsonResponse({ error: `Failed to build transaction: ${(e as Error).message}` }, { status: 502 });
  }
  return jsonResponse({ transaction, message: `Invoice #${invoiceId.toString()} — ${invoicePda.toBase58()}` });
}

export const GET = handleInvoiceGet;
export const POST = handleInvoicePost;
