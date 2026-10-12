import { PublicKey } from "@solana/web3.js";
import { DEFAULT_ICON, publicOrigin, rpcEndpointFor } from "../config.js";
import { badRequest, jsonResponse, optionsResponse } from "../cors.js";
import {
  ataForOwner,
  buildUnsignedTx,
  chargeIx,
  findSubscriptionPda,
  parseAddress,
  parseProgramId,
} from "../solana.js";

/**
 * GET /api/actions/charge?plan=<plan>&subscriber=<pk>&mint=<mint>
 * POST same shape, body: { account } (caller; merchant-only in practice).
 *
 * MERCHANT-ONLY NOTE: anyone can submit the charge instruction, but the
 * program enforces status==Active and now >= last_paid_at + period, pays the
 * merchant ATA of the plan, and advances last_paid_at — so a third-party
 * caller gains nothing (funds still route to the merchant). Off-chain UIs
 * SHOULD still gate the button to the plan merchant and SHOULD verify
 * account == plan.merchant when plan data is fetchable.
 *
 * Next.js wiring (app/api/actions/charge/route.ts):
 *   export async function GET(req: Request) { return handleChargeGet(req); }
 *   export async function POST(req: Request) { return handleChargePost(req); }
 */
export { optionsResponse as OPTIONS };

export async function handleChargeGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const plan = url.searchParams.get("plan") ?? "{plan}";
  const subscriber = url.searchParams.get("subscriber") ?? "{subscriber}";
  const mint = url.searchParams.get("mint") ?? "{mint}";
  const cluster = url.searchParams.get("cluster") ?? "devnet";
  const base = `${publicOrigin(url)}${url.pathname}`;
  return jsonResponse({
    type: "action",
    icon: DEFAULT_ICON,
    title: "Charge subscription",
    description:
      "Merchant-only: pull one period payment via the subscription PDA delegate (transfer_checked). Fails unless the period has elapsed.",
    label: "Charge",
    links: {
      actions: [
        {
          label: "Charge one period",
          href: `${base}?plan=${plan}&subscriber=${subscriber}&mint=${mint}&cluster=${cluster}`,
          parameters: [
            { name: "plan", label: "Plan address" },
            { name: "subscriber", label: "Subscriber address" },
            { name: "mint", label: "Payment mint" },
          ],
        },
      ],
    },
  });
}

export async function handleChargePost(req: Request): Promise<Response> {
  let body: { account?: string };
  try {
    body = (await req.json()) as { account?: string };
  } catch {
    return badRequest("Invalid JSON body; expected { account }.");
  }
  let caller: PublicKey;
  try {
    caller = parseAddress(body.account ?? null, "account");
  } catch (e) {
    return badRequest((e as Error).message);
  }
  const url = new URL(req.url);
  let plan: PublicKey;
  let subscriber: PublicKey;
  let mint: PublicKey;
  try {
    plan = parseAddress(url.searchParams.get("plan"), "plan");
    subscriber = parseAddress(url.searchParams.get("subscriber"), "subscriber");
    mint = parseAddress(url.searchParams.get("mint"), "mint");
  } catch (e) {
    return badRequest((e as Error).message);
  }
  const merchantHintRaw = url.searchParams.get("merchant");
  let merchantHint: PublicKey | null = null;
  if (merchantHintRaw !== null) {
    try {
      merchantHint = parseAddress(merchantHintRaw, "merchant");
    } catch (e) {
      return badRequest((e as Error).message);
    }
    if (!caller.equals(merchantHint)) {
      return badRequest("Caller is not the plan merchant (merchant-only action).");
    }
  }
  const programId = parseProgramId(url);
  const cluster = url.searchParams.get("cluster") ?? "devnet";
  const [subscriptionPda] = findSubscriptionPda(plan, subscriber, programId);
  const merchantForAta = merchantHint ?? caller;
  let transaction: string;
  try {
    transaction = await buildUnsignedTx(rpcEndpointFor(cluster), caller, [
      chargeIx(
        caller,
        plan,
        subscriptionPda,
        ataForOwner(subscriber, mint),
        ataForOwner(merchantForAta, mint),
        mint,
        programId,
      ),
    ]);
  } catch (e) {
    return jsonResponse({ error: `Failed to build transaction: ${(e as Error).message}` }, { status: 502 });
  }
  return jsonResponse({
    type: "transaction",
    transaction,
    message: `Charge one period of ${plan.toBase58()} for ${subscriber.toBase58()}.`,
  });
}

export const GET = handleChargeGet;
export const POST = handleChargePost;
