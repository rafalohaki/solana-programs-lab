/** create_plan instruction (bankrun): happy path + invalid amount/period. */
import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import assert from "node:assert";
import {
  AMOUNT,
  PERIOD,
  Suite,
  expectAnchorError,
  findPlanPda,
  fund,
  newTestMint,
  setupSuite,
} from "./helpers";

describe("create_plan (bankrun)", () => {
  let suite: Suite;
  let merchant: Keypair;
  let mint: anchor.web3.PublicKey;

  before(async () => {
    // Arrange (shared): fresh chain, funded merchant, test mint.
    suite = await setupSuite();
    merchant = Keypair.generate();
    await fund(suite.context, merchant.publicKey);
    mint = await newTestMint(suite);
  });

  it("creates a plan with valid amount + period (happy path)", async () => {
    // Arrange: unused plan id so the PDA is fresh.
    const planId = 1;
    const [planPda] = findPlanPda(merchant.publicKey, planId, suite.program.programId);

    // Act.
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

    // Assert: stored fields match inputs exactly.
    const plan = await suite.program.account.subscriptionPlan.fetch(planPda);
    assert.ok(plan.merchant.equals(merchant.publicKey), "merchant mismatch");
    assert.ok(plan.mint.equals(mint), "mint mismatch");
    assert.strictEqual(plan.amount.toNumber(), AMOUNT, "amount mismatch");
    assert.strictEqual(plan.periodSeconds.toNumber(), PERIOD, "period mismatch");
    assert.strictEqual(plan.planId.toNumber(), planId, "plan_id mismatch");
  });

  it("rejects amount == 0 (InvalidAmount)", async () => {
    // Arrange: fresh PDA, zero amount.
    const planId = 2;
    const [planPda] = findPlanPda(merchant.publicKey, planId, suite.program.programId);

    // Act + assert: handler requires amount > 0.
    await expectAnchorError(
      suite.program.methods
        .createPlan(new anchor.BN(planId), new anchor.BN(0), new anchor.BN(PERIOD))
        .accounts({
          merchant: merchant.publicKey,
          plan: planPda,
          mint,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([merchant])
        .rpc(),
      "InvalidAmount",
    );
  });

  it("rejects period below the 30s floor (PeriodTooShort)", async () => {
    // Arrange: fresh PDA, valid amount but 10s period.
    const planId = 3;
    const [planPda] = findPlanPda(merchant.publicKey, planId, suite.program.programId);

    // Act + assert: handler requires period_seconds >= 30.
    await expectAnchorError(
      suite.program.methods
        .createPlan(new anchor.BN(planId), new anchor.BN(AMOUNT), new anchor.BN(10))
        .accounts({
          merchant: merchant.publicKey,
          plan: planPda,
          mint,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([merchant])
        .rpc(),
      "PeriodTooShort",
    );
  });
});
