import { SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { DEFAULT_ICON, publicOrigin, rpcEndpointFor } from "../config.js";
import { badRequest, jsonResponse, optionsResponse } from "../cors.js";
import {
  ataForOwner,
  buildUnsignedTx,
  chargeInvoiceIx,
  parseAddress,
  parseProgramId,
} from "../solana.js";

/**
 * POST /api/actions/batch  body: { account, items: BatchItem[] }
 *
 * Batch-charges up to 8 invoices in ONE transaction (CargoBill-style batch
 * processing): one charge_invoice instruction per invoice, all signed once
 * by the merchant wallet. Server never signs.
 *
 * BatchItem: { plan, subscription, invoice, subscriberAta, mint } (base58).
 * The merchant ATA is derived per mint; items with different mints are fine.
 */
export { optionsResponse as OPTIONS };

const MAX_ITEMS = 8;

interface BatchItem {
  plan?: string;
  subscription?: string;
  invoice?: string;
  subscriberAta?: string;
  mint?: string;
}

export async function handleBatchGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const cluster = url.searchParams.get("cluster") ?? "devnet";
  const base = `${publicOrigin(url)}${url.pathname}`;
  return jsonResponse({
    type: "action",
    title: "Batch-charge invoices",
    icon: DEFAULT_ICON,
    description: `Merchant charges up to ${MAX_ITEMS} invoices in one transaction. Body: { account, items: [{ plan, subscription, invoice, subscriberAta, mint }] }.`,
    label: "Batch charge",
    links: {
      actions: [{ label: "Batch charge", href: `${base}?cluster=${cluster}` }],
    },
  });
}

export async function handleBatchPost(req: Request): Promise<Response> {
  let body: { account?: string; items?: BatchItem[] };
  try {
    body = (await req.json()) as { account?: string; items?: BatchItem[] };
  } catch {
    return badRequest("Invalid JSON body; expected { account, items: [...] }.");
  }
  const url = new URL(req.url);
  const programId = parseProgramId(url);
  const cluster = url.searchParams.get("cluster") ?? "devnet";

  let merchant;
  try {
    merchant = parseAddress(body.account ?? null, "account");
  } catch (e) {
    return badRequest((e as Error).message);
  }

  const items = body.items ?? [];
  if (items.length === 0 || items.length > MAX_ITEMS) {
    return badRequest(`Body items must hold 1-${MAX_ITEMS} invoices.`);
  }

  try {
    const ixs = items.map((raw) => {
      const plan = parseAddress(raw.plan ?? null, "items[].plan");
      const subscription = parseAddress(raw.subscription ?? null, "items[].subscription");
      const invoice = parseAddress(raw.invoice ?? null, "items[].invoice");
      const subscriberAta = parseAddress(raw.subscriberAta ?? null, "items[].subscriberAta");
      const mint = parseAddress(raw.mint ?? null, "items[].mint");
      return chargeInvoiceIx(
        merchant,
        plan,
        subscription,
        invoice,
        subscriberAta,
        ataForOwner(merchant, mint),
        mint,
        SYSVAR_CLOCK_PUBKEY,
        programId,
      );
    });
    const transaction = await buildUnsignedTx(rpcEndpointFor(cluster), merchant, ixs);
    return jsonResponse({ transaction, message: `Batch-charge ${ixs.length} invoice(s)` });
  } catch (e) {
    const message = (e as Error).message;
    const status = message.startsWith("Invalid") || message.includes("must") ? 400 : 502;
    return jsonResponse({ error: message }, { status });
  }
}

export const GET = handleBatchGet;
export const POST = handleBatchPost;
