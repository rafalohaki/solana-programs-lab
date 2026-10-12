import { createRevokeInstruction } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { DEFAULT_ICON, rpcEndpointFor } from "../config.js";
import { badRequest, jsonResponse, optionsResponse } from "../cors.js";
import {
  ataForOwner,
  buildUnsignedTx,
  cancelIx,
  findSubscriptionPda,
  parseAddress,
  parseProgramId,
} from "../solana.js";

/**
 * GET /api/actions/cancel?plan=<plan>&mint=<mint>
 * POST same shape, body: { account } (subscriber).
 *
 * POST builds: revoke(subscriberAta) + cancel. Revoking first guarantees the
 * delegate allowance is gone even if the program-side revoke CPI is skipped;
 * the program MUST also revoke via CPI when an allowance remains.
 *
 * Next.js wiring (app/api/actions/cancel/route.ts):
 *   export async function GET(req: Request) { return handleCancelGet(req); }
 *   export async function POST(req: Request) { return handleCancelPost(req); }
 */
export { optionsResponse as OPTIONS };

export async function handleCancelGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const plan = url.searchParams.get("plan") ?? "{plan}";
  const mint = url.searchParams.get("mint") ?? "{mint}";
  const cluster = url.searchParams.get("cluster") ?? "devnet";
  const base = `${url.origin}${url.pathname}`;
  return jsonResponse({
    type: "action",
    icon: DEFAULT_ICON,
    title: "Cancel subscription",
    description:
      "Revoke the subscription PDA delegate allowance and mark the subscription Cancelled. No further charges are possible.",
    label: "Cancel",
    links: {
      actions: [
        {
          label: "Cancel subscription",
          href: `${base}?plan=${plan}&mint=${mint}&cluster=${cluster}`,
          parameters: [
            { name: "plan", label: "Plan address" },
            { name: "mint", label: "Payment mint" },
          ],
        },
      ],
    },
  });
}

export async function handleCancelPost(req: Request): Promise<Response> {
  let body: { account?: string };
  try {
    body = (await req.json()) as { account?: string };
  } catch {
    return badRequest("Invalid JSON body; expected { account }.");
  }
  let subscriber: PublicKey;
  try {
    subscriber = parseAddress(body.account ?? null, "account");
  } catch (e) {
    return badRequest((e as Error).message);
  }
  const url = new URL(req.url);
  let plan: PublicKey;
  let mint: PublicKey;
  try {
    plan = parseAddress(url.searchParams.get("plan"), "plan");
    mint = parseAddress(url.searchParams.get("mint"), "mint");
  } catch (e) {
    return badRequest((e as Error).message);
  }
  const programId = parseProgramId(url);
  const cluster = url.searchParams.get("cluster") ?? "devnet";
  const [subscriptionPda] = findSubscriptionPda(plan, subscriber, programId);
  const subscriberAta = ataForOwner(subscriber, mint);

  try {
    const transaction = await buildUnsignedTx(rpcEndpointFor(cluster), subscriber, [
      createRevokeInstruction(subscriberAta, subscriber),
      cancelIx(subscriber, subscriptionPda, subscriberAta, programId),
    ]);
    return jsonResponse({
      type: "transaction",
      transaction,
      message: `Revoke delegate and cancel subscription ${subscriptionPda.toBase58()}.`,
    });
  } catch (e) {
    return jsonResponse({ error: `Failed to build transaction: ${(e as Error).message}` }, { status: 502 });
  }
}

export const GET = handleCancelGet;
export const POST = handleCancelPost;
