import { readable } from "svelte/store";

// ---------------------------------------------------------------------------
// Demo mode: `?demo=1` (shareable) or persisted flag. When ON, islands render
// these Stitch-faithful fixtures INSTEAD of chain/DB fetches, behind a global
// DEMO banner with an exit button (added by parent, not islands).
// Live mode (flag off) shows ONLY real data — dash for missing.
// ---------------------------------------------------------------------------

const FLAG = "solhack-demo";

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("demo") === "1") return true;
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export function setDemoMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(FLAG, "1");
    else localStorage.removeItem(FLAG);
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  if (on) url.searchParams.set("demo", "1");
  else url.searchParams.delete("demo");
  window.location.href = url.toString();
}

export interface DemoPlan {
  address: string;
  merchant: string;
  mintSymbol: string;
  amountUi: string;
  periodLabel: string;
  periodSeconds: number;
  planId: string;
  title: string;
  blurb: string;
  tag: string;
}

export const DEMO_STATS = {
  volumeUsd: 284918.03,
  livePlans: 14,
  merchants: 8,
  accounts: 42,
  mrrUsdc: 3450,
  avgCostSol: 0.00025,
  gasSavedPct: 92,
};

export const DEMO_PLANS: DemoPlan[] = [
  {
    address: "Demo111111111111111111111111111111111111111",
    merchant: "DemoMerchant11111111111111111111111111111",
    mintSymbol: "USDC",
    amountUi: "15",
    periodLabel: "30 days",
    periodSeconds: 2592000,
    planId: "1",
    title: "Alpha Feed Pro",
    blurb: "Whale-volume signals on Solana DEX with instant arbitrage alerts.",
    tag: "Blink Ready",
  },
  {
    address: "Demo222222222222222222222222222222222222222",
    merchant: "DemoMerchant22222222222222222222222222222",
    mintSymbol: "SOL",
    amountUi: "0.85",
    periodLabel: "month",
    periodSeconds: 2592000,
    planId: "2",
    title: "Solana RPC Tier 2",
    blurb: "Dedicated Yellowstone nodes, 500 req/s, priority fee streaming.",
    tag: "Auto-charge",
  },
  {
    address: "Demo333333333333333333333333333333333333333",
    merchant: "DemoMerchant33333333333333333333333333333",
    mintSymbol: "USDC",
    amountUi: "50",
    periodLabel: "quarter",
    periodSeconds: 7776000,
    planId: "3",
    title: "DAO Membership VIP",
    blurb: "Private syndicate access, quarterly airdrops, governance votes.",
    tag: "Governance",
  },
];

export interface DemoReceipt {
  id: string;
  service: string;
  amount: string;
  when: string;
  slot: string;
  signature: string;
}

export const DEMO_RECEIPTS: DemoReceipt[] = [
  { id: "INV-2025-0041", service: "Solana RPC Tier 2", amount: "0.85 SOL", when: "2025-02-18 14:22:01", slot: "282,107,431", signature: "5YtpQ…8K9L" },
  { id: "INV-2025-0039", service: "Alpha Feed Pro", amount: "15.00 USDC", when: "2025-02-06 09:11:44", slot: "280,014,923", signature: "3mG91…4VpX" },
  { id: "INV-2025-0012", service: "AI Agent Compute Quota", amount: "50.00 USDC", when: "2025-01-27 18:40:12", slot: "278,419,880", signature: "9Lk3z…13aq" },
];

/** Reactive demo flag for islands that need to swap copy (rare — prefer isDemoMode() at load). */
export const demoMode = readable(false, (set) => {
  set(isDemoMode());
  return () => {};
});

/**
 * Shareable demo URL for the current page (`?demo=1`). Used by the admin
 * panel "copy demo link" button — builds the link, never enables demo.
 */
export function demoShareLink(): string {
  if (typeof window === "undefined") return "?demo=1";
  const url = new URL(window.location.href);
  url.searchParams.set("demo", "1");
  return url.toString();
}
