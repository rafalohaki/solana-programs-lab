/**
 * cancel instruction (bankrun): status flip + double-cancel and
 * non-subscriber rejections.
 *
 * The wallet revokes the SPL delegate off-chain before cancelling — the
 * supported path per the program docs. (The frozen program cannot CPI-revoke:
 * Cancel.subscriber_ata lacks `mut`, so a program-side revoke with a live
 * allowance escalates writable privileges and fails the transaction. With the
 * delegate already cleared the handler skips its best-effort CPI and flips
 * status to Cancelled.)
 */
import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { getAccount } from "spl-token-bankrun";
import assert from "node:assert";
import {
  AMOUNT,
  PERIOD,
  Suite,
  approveDelegate,
  cancelAccountsFull,
  expectAnchorError,
  filterAccounts,
  findPlanPda,
  findSubscriptionPda,
  fund,
  isCancelled,
  mintToAta,
  newAta,
  newTestMint,
  revokeDelegate,
  setupSuite,
} from "./helpers";

describe("cancel (bankrun)", () => {
  let suite: Suite;
  let merchant: Keypair;
  let subscriber: Keypair;
  let mint: anchor.web3.PublicKey;
  let planIdCounter = 500;

  /** Arrange a subscribed + approved pair; returns its PDAs/ATAs. */
  async function approvedSubscription(subscriberKp: Keypair): Promise<{
    plan: anchor.web3.PublicKey;
    subscription: anchor.web3.PublicKey;
    subscriberAta: anchor.web3.PublicKey;
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
    return { plan, subscription, subscriberAta };
  }

  async function cancelAs(
    caller: Keypair,
    args: {
      plan: anchor.web3.PublicKey;
      subscription: anchor.web3.PublicKey;
      subscriberAta: anchor.web3.PublicKey;
    },
  ): Promise<string> {
    return suite.program.methods
      .cancel()
      .accounts(
        filterAccounts(
          suite.program,
          "cancel",
          cancelAccountsFull({
            subscriber: caller.publicKey,
            plan: args.plan,
            subscription: args.subscription,
            subscriberAta: args.subscriberAta,
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

  it("sets Cancelled and clears the delegate (happy path)", async () => {
    // Arrange: approved subscription with live allowance.
    const s = await approvedSubscription(subscriber);
    const before = await getAccount(suite.banksClient, s.subscriberAta);
    assert.strictEqual(BigInt(before.delegatedAmount), BigInt(AMOUNT), "test needs a live allowance");

    // Act: wallet revokes off-chain, then subscriber cancels on-chain.
    await revokeDelegate(suite, subscriber, s.subscriberAta);
    await cancelAs(subscriber, s);

    // Assert: status flipped.
    const sub = await suite.program.account.subscription.fetch(s.subscription);
    assert.ok(isCancelled(sub.status), `expected Cancelled status, got ${JSON.stringify(sub.status)}`);

    // Assert: delegate stays cleared + allowance zero.
    const after = await getAccount(suite.banksClient, s.subscriberAta);
    assert.strictEqual(after.delegate, null, "delegate must be revoked (null)");
    assert.strictEqual(BigInt(after.delegatedAmount), BigInt(0), "allowance must be zero");
  });

  it("rejects a second cancel (AlreadyCancelled)", async () => {
    // Arrange: fresh subscription cancelled once (wallet revokes off-chain
    // first — see the header note on the frozen program).
    const s = await approvedSubscription(subscriber);
    await revokeDelegate(suite, subscriber, s.subscriberAta);
    await cancelAs(subscriber, s);

    // Act + assert: idempotency guard fires.
    await expectAnchorError(cancelAs(subscriber, s), "AlreadyCancelled");
  });

  it("rejects cancel signed by a non-subscriber (Unauthorized)", async () => {
    // Arrange: victim's approved subscription; attacker is a funded outsider.
    const s = await approvedSubscription(subscriber);
    const attacker = Keypair.generate();
    await fund(suite.context, attacker.publicKey);

    // Act + assert: owner-only check fires; victim's sub is untouched.
    await expectAnchorError(cancelAs(attacker, s), "Unauthorized");
    const sub = await suite.program.account.subscription.fetch(s.subscription);
    assert.ok(!isCancelled(sub.status), "failed cancel must not change status");
  });
});
