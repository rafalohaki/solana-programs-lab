import { createApproveInstruction } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { DEFAULT_ICON, chainIdFor, publicOrigin, rpcEndpointFor } from "../config.js";
import { badRequest, jsonResponse, optionsResponse } from "../cors.js";
import {
  ataForOwner,
  buildUnsignedTx,
  findSubscriptionPda,
  parseAddress,
  parseProgramId,
  subscribeIx,
} from "../solana.js";

/**
 * GET /api/actions/subscribe?plan=<plan>&mint=<mint>&cluster=devnet
 * POST /api/actions/subscribe?plan=<plan>&mint=<mint>  body: { account }
 *
 * POST builds: approve(subscriberAta, delegate=subscriptionPDA) + subscribe.
 * Server never signs; wallet signs both instructions atomically.
 *
 * Next.js wiring (app/api/actions/subscribe/route.ts):
 *   export { OPTIONS } from "<rel>/subscribe.js"; // re-export optionsResponse as OPTIONS
 *   export async function GET(req: Request) { return handleSubscribeGet(req); }
 *   export async function POST(req: Request) { return handleSubscribePost(req); }
 */
export { optionsResponse as OPTIONS };

export async function handleSubscribeGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const plan = url.searchParams.get("plan") ?? "{plan}";
  const mint = url.searchParams.get("mint") ?? "{mint}";
  const cluster = url.searchParams.get("cluster") ?? "devnet";
  const base = `${publicOrigin(url)}${url.pathname}`;

  return jsonResponse({
    type: "action",
    icon: DEFAULT_ICON,
    title: "Subscribe to plan",
    description:
      "Approve the subscription PDA as SPL delegate and open a subscription. The program pulls each period with transfer_checked signed by the subscription PDA.",
    label: "Subscribe",
    links: {
      actions: [
        {
          label: "Subscribe",
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

export async function handleSubscribePost(req: Request): Promise<Response> {
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

  // Allowance covers one period; merchant charges pull via delegate + transfer_checked.
  const amountRaw = url.searchParams.get("amount") ?? "0";
  let allowance: bigint;
  try {
    allowance = BigInt(amountRaw);
    if (allowance <= 0n) throw new Error("empty");
  } catch {
    return badRequest("Query param amount must be a positive integer (raw token units for one period).");
  }

  const [subscriptionPda] = findSubscriptionPda(plan, subscriber, programId);
  const subscriberAta = ataForOwner(subscriber, mint);

  try {
    const transaction = await buildUnsignedTx(rpcEndpointFor(cluster), subscriber, [
      createApproveInstruction(subscriberAta, subscriptionPda, subscriber, allowance),
      subscribeIx(subscriber, plan, subscriptionPda, subscriberAta, programId),
    ]);
    return jsonResponse({
      type: "transaction",
      transaction,
      message: `Approve subscription PDA as delegate and subscribe to ${plan.toBase58()}.`,
    });
  } catch (e) {
    return jsonResponse({ error: `Failed to build transaction: ${(e as Error).message}` }, { status: 502 });
  }
}

/** Next.js-compatible aliases. */
export const GET = handleSubscribeGet;
export const POST = handleSubscribePost;

/** Chain id hint for wallets/debuggers; mirrors actions.json. */
export const CHAIN_ID_NOTE = `Subscribe actions default to ${chainIdFor("devnet")} unless ?cluster=mainnet-beta is passed.`;
