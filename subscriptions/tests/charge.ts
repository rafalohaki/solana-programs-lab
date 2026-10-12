/**
 * charge instruction (bankrun): delegate happy path, Clock-gated repeat
 * billing, cancelled + non-merchant rejections.
 *
 * Model B: subscriber approve()s the subscription PDA off-chain with an
 * allowance of exactly `amount`; charge() CPIs transfer_checked signed by
 * that PDA. Clock is warped forward 31s to test the period gate.
 */
import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { getAccount } from "spl-token-bankrun";
import assert from "node:assert";
import {
  AMOUNT,
  PERIOD,
  Suite,
  advanceClock,
  approveDelegate,
  cancelAccountsFull,
  chargeAccountsFull,
  expectAnchorError,
  feeFor,
  filterAccounts,
  findPlanPda,
  findSubscriptionPda,
  fund,
  isActive,
  mintToAta,
  newAta,
  newTestMint,
  nowTs,
  revokeDelegate,
  setupSuite,
  tokenBalance,
  treasuryAtaForMint,
} from "./helpers";

describe("charge (bankrun)", () => {
  let suite: Suite;
  let merchant: Keypair;
  let subscriber: Keypair;
  let mint: anchor.web3.PublicKey;
  let planIdCounter = 100;

  /** Arrange a subscribed + approved (plan, subscriber) pair, ready to charge. */
  async function readySubscription(
    subscriberKp: Keypair,
    allowance: number = AMOUNT,
  ): Promise<{
    plan: anchor.web3.PublicKey;
    subscription: anchor.web3.PublicKey;
    subscriberAta: anchor.web3.PublicKey;
    merchantAta: anchor.web3.PublicKey;
  }> {
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

    await approveDelegate(suite, subscriberKp, subscriberAta, subscription, allowance);
    return { plan, subscription, subscriberAta, merchantAta };
  }

  async function chargeAs(caller: Keypair, args: {
    plan: anchor.web3.PublicKey;
    subscription: anchor.web3.PublicKey;
    subscriberAta: anchor.web3.PublicKey;
    merchantAta: anchor.web3.PublicKey;
  }): Promise<string> {
    return suite.program.methods
      .charge()
      .accounts(
        filterAccounts(
          suite.program,
          "charge",
          chargeAccountsFull({
            merchant: caller.publicKey,
            plan: args.plan,
            subscription: args.subscription,
            subscriberAta: args.subscriberAta,
            merchantAta: args.merchantAta,
            mint,
          }),
        ),
      )
      .signers([caller])
      .rpc();
  }

  before(async () => {
    // Arrange (shared): chain, mint, funded merchant + subscriber.
    suite = await setupSuite();
    merchant = Keypair.generate();
    subscriber = Keypair.generate();
    await fund(suite.context, merchant.publicKey);
    await fund(suite.context, subscriber.publicKey);
    mint = await newTestMint(suite);
  });

  it("transfers amount via the subscription-PDA delegate (happy path)", async () => {
    // Arrange: approved subscription; assert delegate is the sub PDA first.
    const s = await readySubscription(subscriber);
    const beforeSub = await tokenBalance(suite, s.subscriberAta);
    const beforeMerch = await tokenBalance(suite, s.merchantAta);
    const ataState = await getAccount(suite.banksClient, s.subscriberAta);
    assert.ok(ataState.delegate?.equals(s.subscription), "delegate must be the subscription PDA");
    assert.strictEqual(BigInt(ataState.delegatedAmount), BigInt(AMOUNT), "allowance must equal amount");

    // Act.
    await chargeAs(merchant, s);

    // Assert: split moved (merchant share + treasury fee); clock + status updated.
    // Treasury ATA is created by this first charge on the fresh mint, so the
    // absolute balance equals the fee.
    const fee = feeFor(AMOUNT);
    assert.strictEqual(await tokenBalance(suite, s.subscriberAta), beforeSub - BigInt(AMOUNT));
    assert.strictEqual(await tokenBalance(suite, s.merchantAta), beforeMerch + (BigInt(AMOUNT) - fee));
    assert.strictEqual(await tokenBalance(suite, treasuryAtaForMint(mint)), fee);
    const sub = await suite.program.account.subscription.fetch(s.subscription);
    assert.ok(isActive(sub.status), "subscription must stay Active after charge");
    const now = await nowTs(suite);
    assert.ok(
      BigInt(sub.lastPaidAt.toNumber()) <= now && sub.lastPaidAt.toNumber() > 0,
      `last_paid_at must be the charge timestamp, got ${sub.lastPaidAt.toString()}`,
    );
  });

  it("rejects an immediate second charge (TooEarlyToCharge)", async () => {
    // Arrange: fresh subscription charged once (uses its own plan id).
    const s = await readySubscription(subscriber);
    await chargeAs(merchant, s);

    // Act + assert: no warp yet, so now < last_paid_at + period. The first
    // charge spent the allowance, so re-approve first — otherwise validation
    // rejects the retry as Unauthorized before it reaches the clock gate.
    await approveDelegate(suite, subscriber, s.subscriberAta, s.subscription, AMOUNT);
    await expectAnchorError(chargeAs(merchant, s), "TooEarlyToCharge");
  });

  it("charges again once the period elapses (warp + re-approve)", async () => {
    // Arrange: fresh subscription charged once; first allowance is spent.
    const s = await readySubscription(subscriber);
    await chargeAs(merchant, s);
    const midSub = await tokenBalance(suite, s.subscriberAta);
    const midMerch = await tokenBalance(suite, s.merchantAta);
    // Treasury ATA exists by now (earlier charges in this suite created it),
    // so assert the delta, not the absolute balance.
    const fee = feeFor(AMOUNT);
    const midTreasury = await tokenBalance(suite, treasuryAtaForMint(mint));

    // Act: new allowance for the new period, warp past the gate, charge.
    await approveDelegate(suite, subscriber, s.subscriberAta, s.subscription, AMOUNT);
    await advanceClock(suite, PERIOD + 1);
    await chargeAs(merchant, s);

    // Assert: second split moved (merchant share + treasury fee).
    assert.strictEqual(await tokenBalance(suite, s.subscriberAta), midSub - BigInt(AMOUNT));
    assert.strictEqual(await tokenBalance(suite, s.merchantAta), midMerch + (BigInt(AMOUNT) - fee));
    assert.strictEqual(await tokenBalance(suite, treasuryAtaForMint(mint)), midTreasury + fee);
  });

  it("rejects charge on a cancelled subscription (NotActive)", async () => {
    // Arrange: fresh subscription, then cancel it. The frozen program cannot
    // CPI-revoke (Cancel.subscriber_ata lacks `mut`), so the wallet revokes
    // off-chain first — the supported path per the program docs.
    const victim = Keypair.generate();
    await fund(suite.context, victim.publicKey);
    const s = await readySubscription(victim);
    await revokeDelegate(suite, victim, s.subscriberAta);
    await suite.program.methods
      .cancel()
      .accounts(
        filterAccounts(
          suite.program,
          "cancel",
          cancelAccountsFull({
            subscriber: victim.publicKey,
            plan: s.plan,
            subscription: s.subscription,
            subscriberAta: s.subscriberAta,
          }),
        ),
      )
      .signers([victim])
      .rpc();

    // Re-approve so the charge passes allowance validation and reaches the
    // status gate (otherwise it fails as Unauthorized, not NotActive).
    await approveDelegate(suite, victim, s.subscriberAta, s.subscription, AMOUNT);
    // Act + assert: status gate fires before any transfer.
    await expectAnchorError(chargeAs(merchant, s), "NotActive");
  });

  it("rejects charge signed by a non-merchant (Unauthorized)", async () => {
    // Arrange: fresh approved subscription; attacker is funded so the tx can
    // be built, but they are not plan.merchant. The attacker passes their
    // own (empty) merchant ATA: with the real merchant's ATA the
    // init_if_needed owner check fires first (ConstraintTokenOwner) and the
    // test would never reach the merchant-auth gate.
    const s = await readySubscription(subscriber);
    const attacker = Keypair.generate();
    await fund(suite.context, attacker.publicKey);
    const attackerAta = await newAta(suite, mint, attacker.publicKey);

    // Act + assert: merchant-auth check fires.
    await expectAnchorError(
      chargeAs(attacker, { ...s, merchantAta: attackerAta }),
      "Unauthorized",
    );
  });
});
