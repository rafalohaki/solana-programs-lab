import { Connection, PublicKey } from "@solana/web3.js";
import { DEFAULT_ICON, SUBSCRIPTIONS_PROGRAM_ID, rpcEndpointFor } from "../config.js";
import { badRequest, jsonResponse, optionsResponse } from "../cors.js";
import { parseAddress, parseProgramId } from "../solana.js";
/**
 * GET /api/actions/report?invoice=<pda>
 *
 * Verifiable receipt (MainDocs-style): reads the Invoice account and returns
 * its fields as JSON. Anyone can recompute sha256 over the off-chain invoice
 * metadata and compare with `memoHash` — match + `status: "Paid"` = proof
 * this exact invoice was settled on-chain. Read-only, no signing.
 *
 * Layout: disc(8) + plan(32) + subscription(32) + merchant(32) +
 * subscriber(32) + invoice_id u64(8) + amount u64(8) + memo_hash(32) +
 * paid_at i64(8) + status u8(1) + bump(1) = 194 bytes.
 */
export { optionsResponse as OPTIONS };

const INVOICE_LEN = 194;
const STATUS = ["Unpaid", "Paid", "Voided"] as const;

export async function handleReportGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let invoiceAddr: PublicKey;
  try {
    invoiceAddr = parseAddress(url.searchParams.get("invoice"), "invoice");
  } catch (e) {
    return badRequest((e as Error).message);
  }
  const programId = parseProgramId(url);
  const cluster = url.searchParams.get("cluster") ?? "devnet";

  let raw: Uint8Array;
  try {
    const connection = new Connection(rpcEndpointFor(cluster), "confirmed");
    const info = await connection.getAccountInfo(invoiceAddr, "confirmed");
    if (info === null) return badRequest("Invoice account not found on this cluster.");
    if (!info.owner.equals(programId ?? SUBSCRIPTIONS_PROGRAM_ID)) {
      return badRequest("Account is not owned by the subscriptions program.");
    }
    raw = info.data;
  } catch (e) {
    return jsonResponse({ error: `RPC read failed: ${(e as Error).message}` }, { status: 502 });
  }
  if (raw.length < INVOICE_LEN) return badRequest("Account data too short for an Invoice.");

  const data = Buffer.from(raw);
  const readPubkey = (at: number): string => new PublicKey(data.subarray(at, at + 32)).toBase58();
  const statusByte = data[8 + 32 * 4 + 8 + 8 + 32 + 8];
  // noUncheckedIndexedAccess: statusByte is number | undefined; -1 looks up
  // undefined → "Unknown", byte-identical behaviour to the previous fallback.
  const statusLabel = STATUS[statusByte ?? -1] ?? "Unknown";
  const receipt = {
    invoice: invoiceAddr.toBase58(),
    plan: readPubkey(8),
    subscription: readPubkey(8 + 32),
    merchant: readPubkey(8 + 64),
    subscriber: readPubkey(8 + 96),
    invoiceId: data.readBigUInt64LE(8 + 128).toString(),
    amount: data.readBigUInt64LE(8 + 136).toString(),
    memoHash: Buffer.from(data.subarray(8 + 144, 8 + 176)).toString("hex"),
    paidAt: data.readBigInt64LE(8 + 176).toString(),
    status: statusLabel,
  };
  return jsonResponse({
    title: "Invoice receipt",
    icon: DEFAULT_ICON,
    description: `Invoice #${receipt.invoiceId} — ${receipt.status}. sha256(off-chain metadata) must equal memoHash.`,
    receipt,
  });
}

export const GET = handleReportGet;
