#!/usr/bin/env bash
# Creates an SPL test mint on devnet, creates owner ATAs, and mints test tokens.
# Devnet only. Refuses non-devnet RPCs.
#
# Usage:
#   ./scripts/create-test-mint.sh [--decimals 6] [--amount 1000]
#     [--merchant <PUBKEY>] [--subscriber <PUBKEY>] [--keypair <PATH>] [--rpc-url <URL>]
#
# Env overrides: KEYPAIR, RPC_URL, DECIMALS, MINT_AMOUNT, MERCHANT, SUBSCRIBER.
# Placeholders: --merchant/--subscriber default to the deploy keypair address;
#   pass real test-wallet pubkeys for multi-wallet setups.
set -euo pipefail

KEYPAIR="${KEYPAIR:-/root/.config/solana/deploy-keypair.json}"
RPC_URL="${RPC_URL:-https://api.devnet.solana.com}"
DECIMALS="${DECIMALS:-6}"
MINT_AMOUNT="${MINT_AMOUNT:-1000}"
MERCHANT="${MERCHANT:-}"
SUBSCRIBER="${SUBSCRIBER:-}"

usage() {
  sed -n '2,12p' "$0"
  echo "Defaults: KEYPAIR=$KEYPAIR RPC_URL=$RPC_URL DECIMALS=$DECIMALS MINT_AMOUNT=$MINT_AMOUNT"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --decimals) DECIMALS="$2"; shift 2 ;;
    --amount) MINT_AMOUNT="$2"; shift 2 ;;
    --merchant) MERCHANT="$2"; shift 2 ;;
    --subscriber) SUBSCRIBER="$2"; shift 2 ;;
    --keypair) KEYPAIR="$2"; shift 2 ;;
    --rpc-url) RPC_URL="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$RPC_URL" in
  *devnet*) ;;
  *) echo "Refusing: RPC_URL is not devnet ($RPC_URL). Export RPC_URL=https://api.devnet.solana.com" >&2; exit 1 ;;
esac

command -v spl-token >/dev/null 2>&1 || {
  echo "spl-token CLI not found. Install it first, e.g.:" >&2
  echo "  cargo install spl-token-cli" >&2
  echo "then re-run this script." >&2
  exit 1
}

DEPLOY_ADDR="$(solana address -k "$KEYPAIR")"
MERCHANT="${MERCHANT:-$DEPLOY_ADDR}"
SUBSCRIBER="${SUBSCRIBER:-$DEPLOY_ADDR}"

echo "RPC:     $RPC_URL"
echo "Payer:   $DEPLOY_ADDR ($KEYPAIR)"
echo "Minting $MINT_AMOUNT tokens (decimals=$DECIMALS) to merchant=$MERCHANT subscriber=$SUBSCRIBER"

MINT="$(spl-token create-token --decimals "$DECIMALS" \
  --url "$RPC_URL" --keypair "$KEYPAIR" --output json | grep -oE '"commandOutput":[ ]*"[^"]+"' | grep -oE '[1-9A-HJ-NP-Za-km-z]{32,}' | head -n 1)"
if [[ -z "${MINT:-}" ]]; then
  # Fallback for non-JSON CLI output ("Creating token <MINT>").
  MINT="$(spl-token create-token --decimals "$DECIMALS" \
    --url "$RPC_URL" --keypair "$KEYPAIR" | grep -oiE 'creating token [1-9A-HJ-NP-Za-km-z]{32,}' | awk '{print $NF}' | head -n 1 || true)"
fi
if [[ -z "${MINT:-}" ]]; then
  echo "Could not parse mint address from spl-token output." >&2
  echo "Re-run: spl-token create-token --decimals $DECIMALS --url $RPC_URL --keypair $KEYPAIR" >&2
  exit 1
fi
echo "MINT=$MINT"

for OWNER in "$MERCHANT" "$SUBSCRIBER"; do
  echo "--- account for $OWNER"
  spl-token create-account "$MINT" --owner "$OWNER" \
    --url "$RPC_URL" --keypair "$KEYPAIR" --fee-payer "$KEYPAIR" || true
  ATA="$(spl-token address --token "$MINT" --owner "$OWNER" --url "$RPC_URL" --verbose 2>/dev/null \
    | grep -oiE 'associated token address: [1-9A-HJ-NP-Za-km-z]{32,}' | awk '{print $NF}' | head -n 1 || true)"
  echo "ATA(owner=$OWNER): ${ATA:-<see 'spl-token accounts' output>}"
  if [[ -n "${ATA:-}" ]]; then
    spl-token mint "$MINT" "$MINT_AMOUNT" "$ATA" \
      --url "$RPC_URL" --keypair "$KEYPAIR"
  else
    echo "ATA parse failed; mint manually:" >&2
    echo "  spl-token mint $MINT $MINT_AMOUNT <ATA> --url $RPC_URL --keypair $KEYPAIR" >&2
  fi
done

echo
echo "Done. Export for later steps:"
echo "  export MINT=$MINT"
echo "  PROGRAM_ID=<PROGRAM_ID> MINT=$MINT ./scripts/smoke.sh"
