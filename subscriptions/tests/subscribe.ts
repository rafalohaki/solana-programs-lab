/** subscribe instruction (bankrun): happy path + wrong-mint rejection. */
import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import assert from "node:assert";
import {
  AMOUNT,
  PERIOD,
  Suite,
  expectAnchorError,
  findPlanPda,
  findSubscriptionPda,
  fund,
  isActive,
  mintToAta,
  newAta,
  newTestMint,
  setupSuite,
} from "./helpers";

describe("subscribe (bankrun)", () => {
  let suite: Suite;
  let merchant: Keypair;
  let subscriber: Keypair;
  let mint: anchor.web3.PublicKey;
  let planPda: anchor.web3.PublicKey;
  let subscriberAta: anchor.web3.PublicKey;

  before(async () => {
    // Arrange (shared): chain + plan + funded subscriber with minted ATA.
    suite = await setupSuite();
    merchant = Keypair.generate();
    subscriber = Keypair.generate();
    await fund(suite.context, merchant.publicKey);
    await fund(suite.context, subscriber.publicKey);
    mint = await newTestMint(suite);

    const planId = 7;
    [planPda] = findPlanPda(merchant.publicKey, planId, suite.program.programId);
    await suite.program.methods
      .createPlan(new anchor.BN(planId), new anchor.BN(AMOUNT), new anchor.BN(PERIOD))
      .accounts({
        merchant: merchant.publicKey,
        plan: planPda,
        mint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([merchant])
      .rpc();

    subscriberAta = await newAta(suite, mint, subscriber.publicKey);
    await mintToAta(suite, mint, subscriberAta, 10_000_000);
  });

  it("creates an Active subscription with last_paid_at == 0 (happy path)", async () => {
    // Arrange: subscription PDA for (plan, subscriber).
    const [subPda] = findSubscriptionPda(planPda, subscriber.publicKey, suite.program.programId);

    // Act: no approve CPI here — Model B keeps approve off-chain.
    await suite.program.methods
      .subscribe()
      .accounts({
        subscriber: subscriber.publicKey,
        plan: planPda,
        subscription: subPda,
        subscriberAta,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([subscriber])
      .rpc();

    // Assert: binding + Active + never-charged marker.
    const sub = await suite.program.account.subscription.fetch(subPda);
    assert.ok(sub.plan.equals(planPda), "plan mismatch");
    assert.ok(sub.subscriber.equals(subscriber.publicKey), "subscriber mismatch");
    assert.strictEqual(sub.lastPaidAt.toNumber(), 0, "first charge must be due immediately");
    assert.ok(isActive(sub.status), `expected Active status, got ${JSON.stringify(sub.status)}`);
  });

  it("rejects an ATA in the wrong mint (InvalidMint)", async () => {
    // Arrange: fresh subscriber (fresh PDA namespace) holding an ATA of a
    // different mint; using the same subscriber would collide with the
    // existing subscription account instead of testing the mint check.
    const subscriber2 = Keypair.generate();
    await fund(suite.context, subscriber2.publicKey);
    const wrongMint = await newTestMint(suite);
    const wrongAta = await newAta(suite, wrongMint, subscriber2.publicKey);
    await mintToAta(suite, wrongMint, wrongAta, 10_000_000);
    const [subPda] = findSubscriptionPda(planPda, subscriber2.publicKey, suite.program.programId);

    // Act + assert: subscriber_ata.mint must equal plan.mint.
    await expectAnchorError(
      suite.program.methods
        .subscribe()
        .accounts({
          subscriber: subscriber2.publicKey,
          plan: planPda,
          subscription: subPda,
          subscriberAta: wrongAta,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([subscriber2])
        .rpc(),
      "InvalidMint",
    );
  });
});
