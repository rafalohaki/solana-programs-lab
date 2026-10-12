/**
 * Shared Bankrun harness for the subscriptions program (Model B: delegate + transfer_checked).
 *
 * Assumptions (match program contract + lib.rs/state.rs/errors.rs as landed):
 * - Program builds first (`anchor build` emits target/idl/subscriptions.json +
 *   target/types/subscriptions.ts); tests import both.
 * - Methods: createPlan(planId: u64, amount: u64, periodSeconds: i64),
 *   subscribe(), charge(), cancel() — all camelCase in TS.
 * - PDA seeds: plan = [b"plan", merchant, planId_le8],
 *   subscription = [b"sub", plan, subscriber].
 * - Account names are resolved dynamically from the IDL (filterAccounts), so
 *   extra struct fields (systemProgram / associatedTokenProgram / clock, or
 *   Optional subscriberAta on Cancel) do not break the suite.
 * - Test mint: fresh SPL mint, 6 decimals. Period floor: 30s.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BankrunProvider } from "anchor-bankrun";
import {
  BanksClient,
  Clock,
  ProgramTestContext,
  startAnchor,
} from "solana-bankrun";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createApproveInstruction,
  createRevokeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  mintTo,
} from "spl-token-bankrun";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import assert from "node:assert";

import idlJson from "../target/idl/subscriptions.json";
import { Subscriptions } from "../target/types/subscriptions";

export const DECIMALS = 6;
export const AMOUNT = 1_000_000; // 1.0 token at 6 decimals
export const PERIOD = 30; // seconds — program floor (PeriodTooShort below this)
export const FUND_LAMPORTS = 5_000_000_000;

// Collection fee (must match programs/subscriptions/src/fees.rs).
export const FEE_BPS = 40;
export const FEE_DENOMINATOR = 10_000;
export const TREASURY_WALLET = new PublicKey(
  "2p1sPBmViJjKhUM1aKCsd25nayKeXRJnpmJAWwfYbucP",
);

/** Floor(amount * FEE_BPS / FEE_DENOMINATOR) — mirrors on-chain fee_for(). */
export function feeFor(amount: number | bigint): bigint {
  return (BigInt(amount) * BigInt(FEE_BPS)) / BigInt(FEE_DENOMINATOR);
}

/** Per-mint collection ATA owned by the hardcoded treasury wallet. */
export function treasuryAtaForMint(mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, TREASURY_WALLET);
}

export interface Suite {
  context: ProgramTestContext;
  provider: BankrunProvider;
  program: Program<Subscriptions>;
  banksClient: BanksClient;
  payer: Keypair;
}

/** Boot a fresh bankrun chain with workspace programs deployed. */
export async function setupSuite(): Promise<Suite> {
  // "" = Anchor project root (this file lives in tests/, Anchor.toml is one up).
  const context = await startAnchor("", [], []);
  const provider = new BankrunProvider(context);
  anchor.setProvider(provider);
  const program = new Program<Subscriptions>(
    idlJson as unknown as Subscriptions,
    provider,
  );
  return {
    context,
    provider,
    program,
    banksClient: context.banksClient,
    payer: context.payer,
  };
}

export function findPlanPda(
  merchant: PublicKey,
  planId: number | bigint,
  programId: PublicKey,
): [PublicKey, number] {
  const le = Buffer.alloc(8);
  le.writeBigUInt64LE(typeof planId === "bigint" ? planId : BigInt(planId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("plan"), merchant.toBuffer(), le],
    programId,
  );
}

export function findSubscriptionPda(
  plan: PublicKey,
  subscriber: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sub"), plan.toBuffer(), subscriber.toBuffer()],
    programId,
  );
}

/** Fund a fresh keypair with SOL so it can pay init rent (merchant/subscriber). */
export async function fund(
  context: ProgramTestContext,
  to: PublicKey,
  lamports: number = FUND_LAMPORTS,
): Promise<void> {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: context.payer.publicKey,
      toPubkey: to,
      lamports,
    }),
  );
  [tx.recentBlockhash] = (await context.banksClient.getLatestBlockhash())!;
  tx.feePayer = context.payer.publicKey;
  tx.sign(context.payer);
  await context.banksClient.processTransaction(tx);
}

/** Fresh SPL mint (6 decimals), mint authority = suite payer. */
export async function newTestMint(suite: Suite): Promise<PublicKey> {
  return createMint(
    suite.banksClient,
    suite.payer,
    suite.payer.publicKey,
    null,
    DECIMALS,
  );
}

/**
 * Get-or-create ATA. Suites share one mint per file, so later tests would
 * re-create an existing ATA (the ATA program rejects duplicates with
 * "Provided owner is not allowed"). Return the existing address instead.
 */
export async function newAta(
  suite: Suite,
  mint: PublicKey,
  owner: PublicKey,
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  try {
    await getAccount(suite.banksClient, ata);
    return ata;
  } catch {
    return createAssociatedTokenAccount(
      suite.banksClient,
      suite.payer,
      mint,
      owner,
    );
  }
}

export async function mintToAta(
  suite: Suite,
  mint: PublicKey,
  dest: PublicKey,
  amount: number | bigint,
): Promise<void> {
  await mintTo(
    suite.banksClient,
    suite.payer,
    mint,
    dest,
    suite.payer,
    amount,
  );
}

/**
 * Off-chain Model-B approve: token owner delegates `amount` to the
 * subscription PDA. Mirrors what a wallet/Blink does before charge().
 */
export async function approveDelegate(
  suite: Suite,
  owner: Keypair,
  ata: PublicKey,
  delegate: PublicKey,
  amount: number | bigint,
): Promise<void> {
  const ix = createApproveInstruction(
    ata,
    delegate,
    owner.publicKey,
    amount,
    [],
    TOKEN_PROGRAM_ID,
  );
  const tx = new Transaction().add(ix);
  [tx.recentBlockhash] = (await suite.banksClient.getLatestBlockhash())!;
  tx.feePayer = suite.payer.publicKey;
  tx.sign(suite.payer, owner);
  await suite.banksClient.processTransaction(tx);
}

/** Off-chain revoke (wallets do this on cancel as a backstop). */
export async function revokeDelegate(
  suite: Suite,
  owner: Keypair,
  ata: PublicKey,
): Promise<void> {
  const ix = createRevokeInstruction(ata, owner.publicKey, [], TOKEN_PROGRAM_ID);
  const tx = new Transaction().add(ix);
  [tx.recentBlockhash] = (await suite.banksClient.getLatestBlockhash())!;
  tx.feePayer = suite.payer.publicKey;
  tx.sign(suite.payer, owner);
  await suite.banksClient.processTransaction(tx);
}

export async function tokenBalance(
  suite: Suite,
  ata: PublicKey,
): Promise<bigint> {
  return (await getAccount(suite.banksClient, ata)).amount;
}

/** Current Clock.unix_timestamp as bigint. */
export async function nowTs(suite: Suite): Promise<bigint> {
  return (await suite.banksClient.getClock()).unixTimestamp;
}

/** Move Clock.unix_timestamp forward by deltaSeconds (period testing). */
export async function advanceClock(
  suite: Suite,
  deltaSeconds: number | bigint,
): Promise<void> {
  const clock = await suite.banksClient.getClock();
  const delta = typeof deltaSeconds === "bigint" ? deltaSeconds : BigInt(deltaSeconds);
  suite.context.setClock(
    new Clock(
      clock.slot,
      clock.epochStartTimestamp,
      clock.epoch,
      clock.leaderScheduleEpoch,
      clock.unixTimestamp + delta,
    ),
  );
}

/**
 * Keep only accounts present in the IDL for `ixName`. Lets one test body work
 * whether Charge/Cancel declare systemProgram / associatedTokenProgram /
 * clock or not, and whether Cancel.subscriberAta is Optional.
 */
export function filterAccounts(
  program: Program<Subscriptions>,
  ixName: string,
  full: Record<string, PublicKey | null>,
): Record<string, PublicKey | null> {
  const ix = (program.idl.instructions as Array<{ name: string; accounts: Array<{ name: string }> }>).find(
    (i) => i.name === ixName,
  );
  if (!ix) return full;
  const known = new Set(ix.accounts.map((a) => a.name));
  return Object.fromEntries(
    Object.entries(full).filter(([k]) => known.has(k)),
  );
}

export function chargeAccountsFull(args: {
  merchant: PublicKey;
  plan: PublicKey;
  subscription: PublicKey;
  subscriberAta: PublicKey;
  merchantAta: PublicKey;
  mint: PublicKey;
}): Record<string, PublicKey> {
  return {
    merchant: args.merchant,
    plan: args.plan,
    subscription: args.subscription,
    subscriberAta: args.subscriberAta,
    merchantAta: args.merchantAta,
    treasury: TREASURY_WALLET,
    treasuryAta: treasuryAtaForMint(args.mint),
    mint: args.mint,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
  };
}

export function cancelAccountsFull(args: {
  subscriber: PublicKey;
  plan: PublicKey;
  subscription: PublicKey;
  subscriberAta: PublicKey;
}): Record<string, PublicKey> {
  return {
    subscriber: args.subscriber,
    plan: args.plan,
    subscription: args.subscription,
    subscriberAta: args.subscriberAta,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

/** SubscriptionStatus is a unit enum; decode shape differs by coder version. */
export function isActive(status: unknown): boolean {
  if (status == null) return false;
  if (typeof status === "string") return status.toLowerCase() === "active";
  if (typeof status === "object") {
    const o = status as Record<string, unknown>;
    if ("active" in o || "Active" in o) return true;
  }
  return JSON.stringify(status).toLowerCase().includes("active");
}

export function isCancelled(status: unknown): boolean {
  if (status == null) return false;
  if (typeof status === "string") return status.toLowerCase() === "cancelled";
  if (typeof status === "object") {
    const o = status as Record<string, unknown>;
    if ("cancelled" in o || "Cancelled" in o) return true;
  }
  return JSON.stringify(status).toLowerCase().includes("cancelled");
}

/**
 * Assert a sent instruction fails with one of the expected Anchor error codes
 * (e.g. "PeriodTooShort"). Scans message + errorCode + logs so it holds for
 * both RPC-style AnchorErrors and bankrun-processed failures.
 */
export async function expectAnchorError(
  promise: Promise<unknown>,
  codes: string | string[],
): Promise<unknown> {
  const wants = Array.isArray(codes) ? codes : [codes];
  try {
    await promise;
  } catch (e: unknown) {
    const err = e as Record<string, any>;
    const hay = [
      String(err?.["message"] ?? e),
      String((e as object)?.toString?.() ?? ""),
      String(err?.["error"]?.["errorCode"]?.["code"] ?? ""),
      String(err?.["error"]?.["errorCode"]?.["name"] ?? ""),
      JSON.stringify(err?.["logs"] ?? err?.["error"]?.["logs"] ?? ""),
      JSON.stringify(String(e)).slice(0, 2000),
    ].join("\n");
    for (const w of wants) {
      if (hay.includes(w)) return e;
    }
    assert.fail(
      `Expected error containing one of [${wants.join(", ")}], got:\n${hay.slice(0, 2000)}`,
    );
  }
  assert.fail(
    `Expected instruction to fail with [${wants.join(", ")}] but it succeeded`,
  );
}
