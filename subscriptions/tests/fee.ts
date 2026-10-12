/**
 * Collection fee (bankrun): 40 bps split in charge() and charge_invoice().
 *
 * - Happy path: subscriber loses exactly `amount`; merchant gains
 *   `amount - fee`, treasury gains `fee = floor(amount * 40 / 10000)`.
 * - Dust (`amount = 249`): fee floors to 0, merchant takes the full amount,
 *   treasury ATA is still created (init_if_needed) with a zero balance.
 * - Boundary (`amount = 250`): fee is exactly 1 base unit.
 * - Guards unchanged: second charge_invoice → AlreadyPaid, second charge →
 *   TooEarlyToCharge (re-approve first so the retry reaches the gate).
 * - Treasury binding: impostor `treasury` key → Unauthorized; impostor
 *   `treasuryAta` → account validation fails before any CPI (balances
 *   untouched).
 */
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createHash } from "node:crypto";
import assert from "node:assert";
import {
  AMOUNT,
  PERIOD,
  TREASURY_WALLET,
  Suite,
  advanceClock,
  approveDelegate,
  chargeAccountsFull,
  expectAnchorError,
  feeFor,
  filterAccounts,
  findPlanPda,
  findSubscriptionPda,
  fund,
  mintToAta,
  newAta,
  newTestMint,
  setupSuite,
  tokenBalance,
  treasuryAtaForMint,
} from "./helpers";

function memoHash(label: string): number[] {
  return Array.from(createHash("sha256").update(label).digest());
}

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

describe("collection fee (bankrun)", () => {
  let suite: Suite;
  let merchant: Keypair;
  let subscriber: Keypair;
  let mint: anchor.web3.PublicKey;
  let planIdCounter = 900;

  /** Arrange a subscribed + approved pair for a plan of `amount`. */
  async function readySubscription(subscriberKp: Keypair, amount: number = AMOUNT) {
    const planId = planIdCounter++;
    const [plan] = findPlanPda(merchant.publicKey, planId, suite.program.programId);
    await suite.program.methods
      .createPlan(new anchor.BN(planId), new anchor.BN(amount), new anchor.BN(PERIOD))
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

    const [subscription] = findSubscriptionPda(
      plan,
      subscriberKp.publicKey,
      suite.program.programId,
    );
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

    await approveDelegate(suite, subscriberKp, subscriberAta, subscription, amount);
    return { plan, subscription, subscriberAta, merchantAta, amount };
  }

  async function chargeAs(
    caller: Keypair,
    args: {
      plan: anchor.web3.PublicKey;
      subscription: anchor.web3.PublicKey;
      subscriberAta: anchor.web3.PublicKey;
      merchantAta: anchor.web3.PublicKey;
    },
    overrideAccounts: Record<string, PublicKey> = {},
  ): Promise<string> {
    return suite.program.methods
      .charge()
      .accounts(
        filterAccounts(
          suite.program,
          "charge",
          {
            ...chargeAccountsFull({
              merchant: caller.publicKey,
              plan: args.plan,
              subscription: args.subscription,
              subscriberAta: args.subscriberAta,
              merchantAta: args.merchantAta,
              mint,
            }),
            ...overrideAccounts,
          },
        ),
      )
      .signers([caller])
      .rpc();
  }

  before(async () => {
    suite = await setupSuite();
    merchant = Keypair.generate();
    subscriber = Keypair.generate();
    await fund(suite.context, merchant.publicKey);
    await fund(suite.context, subscriber.publicKey);
    mint = await newTestMint(suite);
  });

  it("splits charge(): merchant takes amount-fee, treasury takes fee", async () => {
    const s = await readySubscription(subscriber);
    const fee = feeFor(AMOUNT);
    assert.ok(fee > 0n, "test amount must carry a nonzero fee");
    const beforeSub = await tokenBalance(suite, s.subscriberAta);
    const beforeMerch = await tokenBalance(suite, s.merchantAta);

    await chargeAs(merchant, s);

    assert.strictEqual(await tokenBalance(suite, s.subscriberAta), beforeSub - BigInt(AMOUNT));
    assert.strictEqual(
      await tokenBalance(suite, s.merchantAta),
      beforeMerch + (BigInt(AMOUNT) - fee),
    );
    // First fee-bearing charge on this suite's fresh mint creates the
    // treasury ATA, so the absolute balance equals the fee.
    assert.strictEqual(await tokenBalance(suite, treasuryAtaForMint(mint)), fee);
  });

  it("charges no fee on dust (fee floors to 0, merchant takes all)", async () => {
    const dust = 249;
    assert.strictEqual(feeFor(dust), 0n, "249 * 40 bps must floor to 0");
    const s = await readySubscription(subscriber, dust);
    const beforeSub = await tokenBalance(suite, s.subscriberAta);
    const beforeMerch = await tokenBalance(suite, s.merchantAta);
    const beforeTreasury = await tokenBalance(suite, treasuryAtaForMint(mint));

    await chargeAs(merchant, s);

    assert.strictEqual(await tokenBalance(suite, s.subscriberAta), beforeSub - BigInt(dust));
    assert.strictEqual(await tokenBalance(suite, s.merchantAta), beforeMerch + BigInt(dust));
    assert.strictEqual(
      await tokenBalance(suite, treasuryAtaForMint(mint)),
      beforeTreasury,
      "dust charge must not move the treasury balance",
    );
  });

  it("charges exactly 1 base unit at the fee boundary (amount = 250)", async () => {
    const edge = 250;
    assert.strictEqual(feeFor(edge), 1n, "250 * 40 bps must be exactly 1");
    const s = await readySubscription(subscriber, edge);
    const beforeMerch = await tokenBalance(suite, s.merchantAta);
    const beforeTreasury = await tokenBalance(suite, treasuryAtaForMint(mint));

    await chargeAs(merchant, s);

    assert.strictEqual(
      await tokenBalance(suite, s.merchantAta),
      beforeMerch + BigInt(edge - 1),
    );
    assert.strictEqual(
      await tokenBalance(suite, treasuryAtaForMint(mint)),
      beforeTreasury + 1n,
    );
  });

  it("splits charge_invoice() identically and emits the fee", async () => {
    const s = await readySubscription(subscriber);
    const invoiceId = 901;
    const [invoice] = findInvoicePda(s.subscription, invoiceId, suite.program.programId);
    await suite.program.methods
      .createInvoice(new anchor.BN(invoiceId), memoHash(`fee-invoice-${invoiceId}`))
      .accounts({
        merchant: merchant.publicKey,
        plan: s.plan,
        subscription: s.subscription,
        invoice,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([merchant])
      .rpc();

    const fee = feeFor(AMOUNT);
    const beforeSub = await tokenBalance(suite, s.subscriberAta);
    const beforeMerch = await tokenBalance(suite, s.merchantAta);
    const beforeTreasury = await tokenBalance(suite, treasuryAtaForMint(mint));

    const sig = await suite.program.methods
      .chargeInvoice()
      .accounts({
        merchant: merchant.publicKey,
        plan: s.plan,
        subscription: s.subscription,
        invoice,
        mint,
        subscriberAta: s.subscriberAta,
        merchantAta: s.merchantAta,
        treasury: TREASURY_WALLET,
        treasuryAta: treasuryAtaForMint(mint),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([merchant])
      .rpc();
    assert.ok(sig, "charge_invoice must return a signature");

    assert.strictEqual(await tokenBalance(suite, s.subscriberAta), beforeSub - BigInt(AMOUNT));
    assert.strictEqual(
      await tokenBalance(suite, s.merchantAta),
      beforeMerch + (BigInt(AMOUNT) - fee),
    );
    assert.strictEqual(
      await tokenBalance(suite, treasuryAtaForMint(mint)),
      beforeTreasury + fee,
    );
  });

  it("keeps double-charge guards: AlreadyPaid (invoice) and TooEarly (charge)", async () => {
    // Invoice path: charge once, re-approve (allowance is spent), retry.
    const a = await readySubscription(subscriber);
    const invoiceId = 902;
    const [invoice] = findInvoicePda(a.subscription, invoiceId, suite.program.programId);
    await suite.program.methods
      .createInvoice(new anchor.BN(invoiceId), memoHash(`fee-invoice-${invoiceId}`))
      .accounts({
        merchant: merchant.publicKey,
        plan: a.plan,
        subscription: a.subscription,
        invoice,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([merchant])
      .rpc();
    const chargeInvoiceOnce = () =>
      suite.program.methods
        .chargeInvoice()
        .accounts({
          merchant: merchant.publicKey,
          plan: a.plan,
          subscription: a.subscription,
          invoice,
          mint,
          subscriberAta: a.subscriberAta,
          merchantAta: a.merchantAta,
          treasury: TREASURY_WALLET,
          treasuryAta: treasuryAtaForMint(mint),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([merchant])
        .rpc();
    await chargeInvoiceOnce();
    await approveDelegate(suite, subscriber, a.subscriberAta, a.subscription, AMOUNT);
    await expectAnchorError(chargeInvoiceOnce(), "AlreadyPaid");

    // Charge path: charge once, re-approve, immediate retry hits the clock.
    const b = await readySubscription(subscriber);
    await chargeAs(merchant, b);
    await approveDelegate(suite, subscriber, b.subscriberAta, b.subscription, AMOUNT);
    await expectAnchorError(chargeAs(merchant, b), "TooEarlyToCharge");

    // ...but the next period still settles with the fee split.
    await advanceClock(suite, PERIOD + 1);
    const beforeTreasury = await tokenBalance(suite, treasuryAtaForMint(mint));
    await chargeAs(merchant, b);
    assert.strictEqual(
      await tokenBalance(suite, treasuryAtaForMint(mint)),
      beforeTreasury + feeFor(AMOUNT),
    );
  });

  it("rejects an impostor treasury key (Unauthorized / ConstraintTokenOwner)", async () => {
    const s = await readySubscription(subscriber);
    const impostor = Keypair.generate().publicKey;
    // Case A: impostor key, genuine treasury ATA. The ATA owner check fires
    // first (authority mismatch) — still a reject before any CPI.
    await expectAnchorError(
      chargeAs(merchant, s, { treasury: impostor }),
      ["Unauthorized", "ConstraintTokenOwner"],
    );
    // Case B: impostor key with its own derived ATA. Derivation passes, so
    // the treasury address pin itself fires with Unauthorized.
    await expectAnchorError(
      chargeAs(merchant, s, {
        treasury: impostor,
        treasuryAta: getAssociatedTokenAddressSync(mint, impostor),
      }),
      "Unauthorized",
    );
  });

  it("rejects an impostor treasury ATA before moving any funds", async () => {
    const s = await readySubscription(subscriber);
    const attacker = Keypair.generate();
    await fund(suite.context, attacker.publicKey);
    const attackerAta = await newAta(suite, mint, attacker.publicKey);
    const beforeSub = await tokenBalance(suite, s.subscriberAta);
    const beforeMerch = await tokenBalance(suite, s.merchantAta);

    let failed = false;
    try {
      await chargeAs(merchant, s, { treasuryAta: attackerAta });
    } catch {
      failed = true;
    }
    assert.ok(failed, "charge with an impostor treasury ATA must fail");
    assert.strictEqual(
      await tokenBalance(suite, s.subscriberAta),
      beforeSub,
      "failed charge must not debit the subscriber",
    );
    assert.strictEqual(
      await tokenBalance(suite, s.merchantAta),
      beforeMerch,
      "failed charge must not credit the merchant",
    );
  });
});
