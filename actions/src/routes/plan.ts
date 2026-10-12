import { PublicKey } from "@solana/web3.js";
import { DEFAULT_ICON, publicOrigin, rpcEndpointFor } from "../config.js";
import { badRequest, jsonResponse, optionsResponse } from "../cors.js";
import {
  buildUnsignedTx,
  createPlanIx,
  findPlanPda,
  parseAddress,
  parseProgramId,
} from "../solana.js";

/**
 * GET /api/actions/plan?merchant=<pk>&planId=<n>&mint=<mint>&amount=<n>&period=<s>
 * POST same shape, body: { account } (must equal merchant).
 *
 * POST builds a single create_plan instruction for the derived Plan PDA
 * [b"plan", merchant, plan_id LE8]. No signing server-side.
 *
 * Next.js wiring (app/api/actions/plan/route.ts):
 *   export async function GET(req: Request) { return handlePlanGet(req); }
 *   export async function POST(req: Request) { return handlePlanPost(req); }
 */
export { optionsResponse as OPTIONS };

export async function handlePlanGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const q = (k: string, fb: string): string => url.searchParams.get(k) ?? fb;
  const base = `${publicOrigin(url)}${url.pathname}`;
  return jsonResponse({
    type: "action",
    icon: DEFAULT_ICON,
    title: "Create subscription plan",
    description: "Merchant creates an on-chain plan: price per period, billing period, and payment mint.",
    label: "Create plan",
    links: {
      actions: [
        {
          label: "Create plan",
          href:
            `${base}?merchant=${q("merchant", "{merchant}")}` +
            `&planId=${q("planId", "{planId}")}&mint=${q("mint", "{mint}")}` +
            `&amount=${q("amount", "{amount}")}&period=${q("period", "{period}")}`,
          parameters: [
            { name: "merchant", label: "Merchant address" },
            { name: "planId", label: "Plan id (u64)" },
            { name: "mint", label: "Payment mint" },
            { name: "amount", label: "Amount per period (raw units)" },
            { name: "period", label: "Period in seconds" },
          ],
        },
      ],
    },
  });
}

export async function handlePlanPost(req: Request): Promise<Response> {
  let body: { account?: string };
  try {
    body = (await req.json()) as { account?: string };
  } catch {
    return badRequest("Invalid JSON body; expected { account }.");
  }
  const url = new URL(req.url);
  let merchant: PublicKey;
  let mint: PublicKey;
  try {
    const account = parseAddress(body.account ?? null, "account");
    merchant = parseAddress(url.searchParams.get("merchant") ?? body.account ?? null, "merchant");
    mint = parseAddress(url.searchParams.get("mint"), "mint");
    if (!account.equals(merchant)) return badRequest("Body account must equal the merchant creating the plan.");
  } catch (e) {
    return badRequest((e as Error).message);
  }

  const num = (k: string): bigint | null => {
    const raw = url.searchParams.get(k);
    if (raw === null) return null;
    try {
      const v = BigInt(raw);
      return v >= 0n ? v : null;
    } catch {
      return null;
    }
  };
  const planId = num("planId");
  const amount = num("amount");
  const period = num("period");
  if (planId === null || amount === null || period === null || amount <= 0n || period <= 0n) {
    return badRequest("Query params planId/amount/period must be positive integers (amount/period > 0).");
  }

  const programId = parseProgramId(url);
  const cluster = url.searchParams.get("cluster") ?? "devnet";
  const [planPda] = findPlanPda(merchant, planId, programId);

  try {
    const transaction = await buildUnsignedTx(rpcEndpointFor(cluster), merchant, [
      createPlanIx(merchant, planPda, mint, { planId, amount, periodSeconds: period }, programId),
    ]);
    return jsonResponse({
      type: "transaction",
      transaction,
      message: `Create plan ${planId.toString()} at ${planPda.toBase58()}.`,
    });
  } catch (e) {
    return jsonResponse({ error: `Failed to build transaction: ${(e as Error).message}` }, { status: 502 });
  }
}

export const GET = handlePlanGet;
export const POST = handlePlanPost;
