import { describe, expect, test } from "bun:test";
import { DEMO_PLANS, DEMO_RECEIPTS, DEMO_STATS } from "../src/lib/demo.js";

// ---------------------------------------------------------------------------
// Frozen demo-fixture contract. e2e selectors assert on strings derived from
// these fixtures (e.g. detail.spec.ts expects "$" in #settled-volume which
// the page renders as formatUsd(volumeUsd * 1e6)) — changing the fixture or
// its derived strings must fail here first, at unit level.
// ---------------------------------------------------------------------------

/** Mirrors pages/index.astro formatUsd() for the demo volume rendering. */
function formatUsd(volumeUsd: number): string {
  const micro = BigInt(Math.round(volumeUsd * 1_000_000));
  const MICRO = 1_000_000n;
  const whole = (micro / MICRO).toLocaleString("en-US");
  const cents = (micro % MICRO).toString().padStart(6, "0").slice(0, 2);
  return `$${whole}.${cents}`;
}

describe("DEMO_STATS fixture", () => {
  test("keeps the frozen numbers e2e and hero copy depend on", () => {
    expect(DEMO_STATS.volumeUsd).toEqual(284918.03);
    expect(DEMO_STATS.livePlans).toEqual(14);
    expect(DEMO_STATS.merchants).toEqual(8);
    expect(DEMO_STATS.accounts).toEqual(42);
    expect(DEMO_STATS.mrrUsdc).toEqual(3450);
    expect(DEMO_STATS.avgCostSol).toEqual(0.00025);
    expect(DEMO_STATS.gasSavedPct).toEqual(92);
  });

  test("renders the settled volume with the frozen $ label", () => {
    // #settled-volume gets exactly this string in demo mode.
    expect(formatUsd(DEMO_STATS.volumeUsd)).toEqual("$284,918.03");
    expect(formatUsd(DEMO_STATS.volumeUsd)).toContain("$");
  });
});

describe("DEMO_PLANS fixture", () => {
  test("keeps the frozen plan cards copy", () => {
    expect(
      DEMO_PLANS.map((p) => [p.title, p.amountUi, p.periodLabel, p.mintSymbol, p.tag, p.planId]),
    ).toEqual([
      ["Alpha Feed Pro", "15", "30 days", "USDC", "Blink Ready", "1"],
      ["Solana RPC Tier 2", "0.85", "month", "SOL", "Auto-charge", "2"],
      ["DAO Membership VIP", "50", "quarter", "USDC", "Governance", "3"],
    ]);
  });
});

describe("DEMO_RECEIPTS fixture", () => {
  test("keeps the frozen receipt rows", () => {
    expect(DEMO_RECEIPTS.map((r) => [r.id, r.amount, r.signature])).toEqual([
      ["INV-2025-0041", "0.85 SOL", "5YtpQ…8K9L"],
      ["INV-2025-0039", "15.00 USDC", "3mG91…4VpX"],
      ["INV-2025-0012", "50.00 USDC", "9Lk3z…13aq"],
    ]);
  });
});
