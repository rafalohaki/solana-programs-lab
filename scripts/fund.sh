#!/usr/bin/env bash
# Airdrops devnet SOL to a test wallet. Devnet only. Refuses non-devnet RPCs.
#
# Usage:
#   ./scripts/fund.sh [--address <PUBKEY>] [--amount 1] [--retries 3] [--keypair <PATH>] [--rpc-url <URL>]
#
# Env overrides: ADDRESS, AMOUNT, RETRIES, KEYPAIR, RPC_URL.
# Default ADDRESS = deploy keypair address. Default AMOUNT = 1 (devnet SOL).
set -euo pipefail

KEYPAIR="${KEYPAIR:-/root/.config/solana/deploy-keypair.json}"
RPC_URL="${RPC_URL:-https://api.devnet.solana.com}"
ADDRESS="${ADDRESS:-}"
AMOUNT="${AMOUNT:-1}"
RETRIES="${RETRIES:-3}"

usage() {
  sed -n '2,9p' "$0"
  echo "Defaults: KEYPAIR=$KEYPAIR RPC_URL=$RPC_URL AMOUNT=$AMOUNT RETRIES=$RETRIES"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --address) ADDRESS="$2"; shift 2 ;;
    --amount) AMOUNT="$2"; shift 2 ;;
    --retries) RETRIES="$2"; shift 2 ;;
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

if [[ -z "$ADDRESS" ]]; then
  ADDRESS="$(solana address -k "$KEYPAIR")"
fi

echo "Balance before: $(solana balance "$ADDRESS" --url "$RPC_URL")"
ok=0
for ((i = 1; i <= RETRIES; i++)); do
  if solana airdrop "$AMOUNT" "$ADDRESS" --url "$RPC_URL" --keypair "$KEYPAIR"; then
    ok=1
    break
  fi
  echo "Airdrop attempt $i/$RETRIES failed (faucet may be rate-limited); sleeping 15s..." >&2
  sleep 15
done
if [[ "$ok" -ne 1 ]]; then
  echo "Airdrop failed after $RETRIES attempts. Try https://faucet.solana.com for $ADDRESS" >&2
  exit 1
fi
sleep 5
echo "Balance after:  $(solana balance "$ADDRESS" --url "$RPC_URL")"
