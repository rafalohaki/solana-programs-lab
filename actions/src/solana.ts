import { createHash } from "node:crypto";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { SUBSCRIPTIONS_PROGRAM_ID } from "./config.js";

/**
 * Collection-fee treasury (must match `TREASURY_WALLET` in
 * subscriptions/programs/subscriptions/src/fees.rs). Owner of the per-mint
 * fee ATA; pinned on-chain, so builders derive — never accept it as input.
 */
export const TREASURY_WALLET = new PublicKey(
  "2p1sPBmViJjKhUM1aKCsd25nayKeXRJnpmJAWwfYbucP",
);

/** Per-mint collection ATA owned by {@link TREASURY_WALLET}. */
export function treasuryAtaForMint(mint: PublicKey): PublicKey {
  return ataForOwner(TREASURY_WALLET, mint);
}

/** PDA seeds — MUST match subscriptions/programs/subscriptions/src/lib.rs. */
export function findPlanPda(
  merchant: PublicKey,
  planId: bigint,
  programId: PublicKey = SUBSCRIPTIONS_PROGRAM_ID,
): [PublicKey, number] {
  const le8 = Buffer.alloc(8);
  le8.writeBigUInt64LE(planId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("plan"), merchant.toBuffer(), le8],
    programId,
  );
}

export function findSubscriptionPda(
  plan: PublicKey,
  subscriber: PublicKey,
  programId: PublicKey = SUBSCRIPTIONS_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sub"), plan.toBuffer(), subscriber.toBuffer()],
    programId,
  );
}

/** Anchor discriminator: sha256("global:<name>")[0..8]. */
export function discriminator(ixName: string): Buffer {
  return createHash("sha256").update(`global:${ixName}`).digest().subarray(0, 8);
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

function i64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return b;
}

export interface PlanArgs {
  planId: bigint;
  amount: bigint;
  periodSeconds: bigint;
}

/**
 * Instruction builders — account order MUST match the
 * `#[derive(Accounts)]` structs in
 * subscriptions/programs/subscriptions/src/instructions/:
 *
 * - CreatePlan:  [merchant(signer,w), planPda(w), mint(r), systemProgram]
 * - Subscribe:   [subscriber(signer,w), plan(r), subscriptionPda(w), systemProgram]
 * - Charge:      [caller(signer,w), plan(r), subscription(w), mint(r),
 *                 subscriberAta(w), merchantAta(w), treasury(r),
 *                 treasuryAta(w), tokenProgram, ataProgram, systemProgram,
 *                 clock]
 * - Cancel:      [subscriber(signer), plan(r), subscription(w),
 */
export function createPlanIx(
  merchant: PublicKey,
  planPda: PublicKey,
  mint: PublicKey,
  args: PlanArgs,
  programId: PublicKey = SUBSCRIPTIONS_PROGRAM_ID,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: merchant, isSigner: true, isWritable: true },
      { pubkey: planPda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      discriminator("create_plan"),
      u64le(args.planId),
      u64le(args.amount),
      i64le(args.periodSeconds),
    ]),
  });
}

export function subscribeIx(
  subscriber: PublicKey,
  plan: PublicKey,
  subscriptionPda: PublicKey,
  subscriberAta: PublicKey,
  programId: PublicKey = SUBSCRIPTIONS_PROGRAM_ID,
): TransactionInstruction {
  // Keys mirror `Subscribe` field order (Anchor maps positionally): the
  // subscriber ATA is a READ-ONLY owner/mint binding — approve stays off-chain.
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: subscriber, isSigner: true, isWritable: true },
      { pubkey: plan, isSigner: false, isWritable: false },
      { pubkey: subscriptionPda, isSigner: false, isWritable: true },
      { pubkey: subscriberAta, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: discriminator("subscribe"),
  });
}

export function chargeIx(
  caller: PublicKey,
  plan: PublicKey,
  subscriptionPda: PublicKey,
  subscriberAta: PublicKey,
  merchantAta: PublicKey,
  mint: PublicKey,
  programId: PublicKey = SUBSCRIPTIONS_PROGRAM_ID,
  treasuryAta: PublicKey = treasuryAtaForMint(mint),
): TransactionInstruction {
  // Keys mirror `Charge` field order (Anchor maps positionally). The program
  // splits every charge: (amount - fee) → merchantAta, fee → treasuryAta
  // (40 bps, floored, min 0). `treasuryAta` defaults to the derived treasury
  // ATA so existing callers (charge/batch routes) keep building valid txs.
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: caller, isSigner: true, isWritable: true },
      { pubkey: plan, isSigner: false, isWritable: false },
      { pubkey: subscriptionPda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: subscriberAta, isSigner: false, isWritable: true },
      { pubkey: merchantAta, isSigner: false, isWritable: true },
      { pubkey: TREASURY_WALLET, isSigner: false, isWritable: false },
      { pubkey: treasuryAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: discriminator("charge"),
  });
}

export function cancelIx(
  subscriber: PublicKey,
  subscriptionPda: PublicKey,
  subscriberAta: PublicKey,
  programId: PublicKey = SUBSCRIPTIONS_PROGRAM_ID,
): TransactionInstruction {
  // Keys mirror `Cancel` field order: NO plan account exists (the PDA encodes
  // it) — a stray plan key used to shift every account and fail on-chain.
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: subscriber, isSigner: true, isWritable: true },
      { pubkey: subscriptionPda, isSigner: false, isWritable: true },
      { pubkey: subscriberAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: discriminator("cancel"),
  });
}

/** Parse a base58 address query/body param, throwing a Blink-friendly error. */
export function parseAddress(value: string | null, name: string): PublicKey {
  if (!value) throw new Error(`Missing required parameter: ${name}`);
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid ${name} address: ${value}`);
  }
}

export function parseProgramId(url: URL): PublicKey {
  const raw = url.searchParams.get("programId");
  if (!raw) return SUBSCRIPTIONS_PROGRAM_ID;
  return parseAddress(raw, "programId");
}

export function ataForOwner(owner: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}

/** Build an unsigned, base64-encoded transaction (never signed server-side). */
export async function buildUnsignedTx(
  rpcEndpoint: string,
  feePayer: PublicKey,
  instructions: TransactionInstruction[],
): Promise<string> {
  const connection = new Connection(rpcEndpoint, "confirmed");
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer, recentBlockhash: blockhash });
  tx.add(...instructions);
  return tx.serialize({ verifySignatures: false, requireAllSignatures: false }).toString("base64");
}

/** Invoice PDA — MUST match `Invoice` seeds in state.rs. */
export function findInvoicePda(
  subscription: PublicKey,
  invoiceId: bigint,
  programId: PublicKey = SUBSCRIPTIONS_PROGRAM_ID,
): [PublicKey, number] {
  const le8 = Buffer.alloc(8);
  le8.writeBigUInt64LE(invoiceId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("invoice"), subscription.toBuffer(), le8],
    programId,
  );
}

/**
 * Invoice instruction builders — account order MUST match the
 * `#[derive(Accounts)]` structs in instructions/:
 *
 * - CreateInvoice: [merchant(signer,w), plan(r), subscription(r),
 *                   invoice(w), systemProgram]
 * - ChargeInvoice: [merchant(signer,w), plan(r), subscription(w),
 *                   invoice(w), mint(r), subscriberAta(w), merchantAta(w),
 *                   treasury(r), treasuryAta(w),
 *                   tokenProgram, ataProgram, systemProgram, clock]
 * - VoidInvoice:   [merchant(signer), invoice(w)]
 */
export function createInvoiceIx(
  merchant: PublicKey,
  plan: PublicKey,
  subscription: PublicKey,
  invoicePda: PublicKey,
  invoiceId: bigint,
  memoHash: Uint8Array,
  programId: PublicKey = SUBSCRIPTIONS_PROGRAM_ID,
): TransactionInstruction {
  if (memoHash.length !== 32) throw new Error("memoHash must be 32 bytes (sha256).");
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: merchant, isSigner: true, isWritable: true },
      { pubkey: plan, isSigner: false, isWritable: false },
      { pubkey: subscription, isSigner: false, isWritable: false },
      { pubkey: invoicePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      discriminator("create_invoice"),
      u64le(invoiceId),
      Buffer.from(memoHash),
    ]),
  });
}

export function chargeInvoiceIx(
  merchant: PublicKey,
  plan: PublicKey,
  subscriptionPda: PublicKey,
  invoicePda: PublicKey,
  subscriberAta: PublicKey,
  merchantAta: PublicKey,
  mint: PublicKey,
  clock: PublicKey,
  programId: PublicKey = SUBSCRIPTIONS_PROGRAM_ID,
  treasuryAta: PublicKey = treasuryAtaForMint(mint),
): TransactionInstruction {
  // Keys mirror `ChargeInvoice` field order. Same 40 bps split as charge():
  // (amount - fee) → merchantAta, fee → treasuryAta. Defaults keep the
  // batch route building valid txs without code changes.
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: merchant, isSigner: true, isWritable: true },
      { pubkey: plan, isSigner: false, isWritable: false },
      { pubkey: subscriptionPda, isSigner: false, isWritable: true },
      { pubkey: invoicePda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: subscriberAta, isSigner: false, isWritable: true },
      { pubkey: merchantAta, isSigner: false, isWritable: true },
      { pubkey: TREASURY_WALLET, isSigner: false, isWritable: false },
      { pubkey: treasuryAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: clock, isSigner: false, isWritable: false },
    ],
    data: discriminator("charge_invoice"),
  });
}

export function voidInvoiceIx(
  merchant: PublicKey,
  invoicePda: PublicKey,
  programId: PublicKey = SUBSCRIPTIONS_PROGRAM_ID,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: merchant, isSigner: true, isWritable: false },
      { pubkey: invoicePda, isSigner: false, isWritable: true },
    ],
    data: discriminator("void_invoice"),
  });
}
