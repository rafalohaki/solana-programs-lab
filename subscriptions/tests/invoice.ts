/**
 * invoice instructions (bankrun): create → charge_invoice happy path,
 * double-charge + void rules.
 *
 * Winner-slice: merchant batch-bills a subscribed customer with a
 * memo_hash (sha256 over off-chain invoice metadata); charge_invoice moves
 * exactly plan.amount via the subscription-PDA delegate and flips the
 * invoice to Paid with paid_at — the on-chain verifiable receipt.
 */
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createHash } from "node:crypto";
import assert from "node:assert";
import {
  AMOUNT,
  PERIOD,
  Suite,
  TREASURY_WALLET,
  approveDelegate,
  expectAnchorError,
  feeFor,
  findPlanPda,
  findSubscriptionPda,
  fund,
  isActive,
  mintToAta,
  newAta,
  newTestMint,
  setupSuite,
  tokenBalance,
  treasuryAtaForMint,
} from "./helpers";

function findInvoicePda(
  subscription: PublicKey,
  invoiceId: number | bigint,
  programId: PublicKey,
): [PublicKey, number] {
  const le = Buffer.alloc(8);
  le.writeBigUInt64LE(typeof invoiceId === "bigint" ? invoiceId : BigInt(invoiceId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("invoice"), subscription.toBuffer(), le],
    programId,
  );
}

function memoHash(label: string): number[] {
  return Array.from(createHash("sha256").update(label).digest());
}

describe("invoice (bankrun)", () => {
  let suite: Suite;
  let merchant: Keypair;
  let subscriber: Keypair;
  let mint: anchor.web3.PublicKey;
  let planIdCounter = 500;
  async function fetchInvoice(address: PublicKey) {
    return suite.program.account.invoice.fetch(address);
  }

  async function chargeInvoiceAccounts(args: {
    plan: PublicKey;
    subscription: PublicKey;
    invoice: PublicKey;
    subscriberAta: PublicKey;
    merchantAta: PublicKey;
  }): Promise<string> {
    return suite.program.methods
      .chargeInvoice()
      .accounts({
        merchant: merchant.publicKey,
        plan: args.plan,
        subscription: args.subscription,
        invoice: args.invoice,
        mint,
        subscriberAta: args.subscriberAta,
        merchantAta: args.merchantAta,
        treasury: TREASURY_WALLET,
        treasuryAta: treasuryAtaForMint(mint),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([merchant])
      .rpc();
  }

  async function readySubscription(subscriberKp: Keypair) {
    const planId = planIdCounter++;
    const [plan] = findPlanPda(merchant.publicKey, planId, suite.program.programId);
    await suite.program.methods
      .createPlan(new anchor.BN(planId), new anchor.BN(AMOUNT), new anchor.BN(PERIOD))
      .accounts({
        merchant: merchant.publicKey,
        plan,
        mint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([merchant])
      .rpc();

    const subscriberAta = await newAta(suite, mint, subscriberKp.publicKey);
    await mintToAta(suite, mint, subscriberAta, 10 * AMOUNT);
    const merchantAta = await newAta(suite, mint, merchant.publicKey);

    const [subscription] = findSubscriptionPda(plan, subscriberKp.publicKey, suite.program.programId);
    await suite.program.methods
      .subscribe()
      .accounts({
        subscriber: subscriberKp.publicKey,
        plan,
        subscription,
        subscriberAta,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([subscriberKp])
      .rpc();

    await approveDelegate(suite, subscriberKp, subscriberAta, subscription, AMOUNT);
    return { plan, subscription, subscriberAta, merchantAta };
  }

  before(async () => {
    suite = await setupSuite();
    merchant = Keypair.generate();
    subscriber = Keypair.generate();
    await fund(suite.context, merchant.publicKey);
    await fund(suite.context, subscriber.publicKey);
    mint = await newTestMint(suite);
  });

  it("creates an invoice bound to the subscription (Unpaid, amount snapshotted)", async () => {
    const s = await readySubscription(subscriber);
    const invoiceId = 1;
    const [invoice] = findInvoicePda(s.subscription, invoiceId, suite.program.programId);
    const hash = memoHash(`invoice-${invoiceId}`);

    await suite.program.methods
      .createInvoice(new anchor.BN(invoiceId), hash)
      .accounts({
        merchant: merchant.publicKey,
        plan: s.plan,
        subscription: s.subscription,
        invoice,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([merchant])
      .rpc();

    const inv = await fetchInvoice(invoice);
    assert.strictEqual(BigInt(inv.amount.toString()), BigInt(AMOUNT));
    assert.deepStrictEqual(inv.memoHash, hash);
    assert.ok("unpaid" in inv.status, "invoice must be Unpaid");
    assert.strictEqual(BigInt(inv.paidAt.toString()), 0n);
  });

  it("charges the invoice via the delegate and flips it to Paid (receipt)", async () => {
    const s = await readySubscription(subscriber);
    const invoiceId = 2;
    const [invoice] = findInvoicePda(s.subscription, invoiceId, suite.program.programId);
    await suite.program.methods
      .createInvoice(new anchor.BN(invoiceId), memoHash(`invoice-${invoiceId}`))
      .accounts({
        merchant: merchant.publicKey,
        plan: s.plan,
        subscription: s.subscription,
        invoice,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([merchant])
      .rpc();

    const beforeSub = await tokenBalance(suite, s.subscriberAta);
    const beforeMerch = await tokenBalance(suite, s.merchantAta);

    await chargeInvoiceAccounts({
      plan: s.plan,
      subscription: s.subscription,
      invoice,
      subscriberAta: s.subscriberAta,
      merchantAta: s.merchantAta,
    });

    // Split: merchant share + treasury fee (this suite's first fee-bearing
    // charge creates the treasury ATA, so its balance equals the fee).
    const fee = feeFor(AMOUNT);
    assert.strictEqual(await tokenBalance(suite, s.subscriberAta), beforeSub - BigInt(AMOUNT));
    assert.strictEqual(await tokenBalance(suite, s.merchantAta), beforeMerch + (BigInt(AMOUNT) - fee));
    assert.strictEqual(await tokenBalance(suite, treasuryAtaForMint(mint)), fee);
    const inv = await fetchInvoice(invoice);
    assert.ok("paid" in inv.status, "invoice must be Paid");
    assert.ok(BigInt(inv.paidAt.toString()) > 0n, "paid_at must be set");
    const sub = await suite.program.account.subscription.fetch(s.subscription);
    assert.ok(isActive(sub.status), "subscription stays Active after invoice charge");
  });

  it("rejects charging the same invoice twice (AlreadyPaid)", async () => {
    const s = await readySubscription(subscriber);
    const invoiceId = 3;
    const [invoice] = findInvoicePda(s.subscription, invoiceId, suite.program.programId);
    await suite.program.methods
      .createInvoice(new anchor.BN(invoiceId), memoHash(`invoice-${invoiceId}`))
      .accounts({
        merchant: merchant.publicKey,
        plan: s.plan,
        subscription: s.subscription,
        invoice,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([merchant])
      .rpc();

    const args = {
      plan: s.plan,
      subscription: s.subscription,
      invoice,
      subscriberAta: s.subscriberAta,
      merchantAta: s.merchantAta,
    };
    await chargeInvoiceAccounts(args);
    // The first charge spent the allowance, so validation would reject the
    // retry as Unauthorized before it reaches the invoice gate. Re-approve
    // to isolate the AlreadyPaid check.
    await approveDelegate(suite, subscriber, s.subscriberAta, s.subscription, AMOUNT);
    await expectAnchorError(chargeInvoiceAccounts(args), "AlreadyPaid");
  });

  it("voids an unpaid invoice (merchant only)", async () => {
    const s = await readySubscription(subscriber);
    const invoiceId = 4;
    const [invoice] = findInvoicePda(s.subscription, invoiceId, suite.program.programId);
    await suite.program.methods
      .createInvoice(new anchor.BN(invoiceId), memoHash(`invoice-${invoiceId}`))
      .accounts({
        merchant: merchant.publicKey,
        plan: s.plan,
        subscription: s.subscription,
        invoice,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([merchant])
      .rpc();

    await suite.program.methods
      .voidInvoice()
      .accounts({ merchant: merchant.publicKey, invoice })
      .signers([merchant])
      .rpc();

    const inv = await fetchInvoice(invoice);
    assert.ok("voided" in inv.status, "invoice must be Voided");
  });
});
