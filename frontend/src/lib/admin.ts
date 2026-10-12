import { isDemoMode, setDemoMode } from "./demo.js";

// ---------------------------------------------------------------------------
// Admin gate: single treasury/operator wallet. AdminPanel renders ONLY when
// the connected wallet matches; everyone else gets null (no layout shift).
// Production default is live — demo fixtures load solely via setDemoMode(true)
// or a shared `?demo=1` link, never by default.
// ---------------------------------------------------------------------------

export const ADMIN_WALLET = "2p1sPBmViJjKhUM1aKCsd25nayKeXRJnpmJAWwfYbucP";

/** wallet.address is PublicKey | null — accept a string or a PublicKey-like. */
export function isAdmin(addr: string | { toBase58(): string } | null | undefined): boolean {
  if (addr === null || addr === undefined) return false;
  const base58 = typeof addr === "string" ? addr : addr.toBase58();
  return base58 === ADMIN_WALLET;
}

export { isDemoMode, setDemoMode };
export { demoShareLink } from "./demo.js";
