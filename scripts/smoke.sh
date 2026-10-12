#!/usr/bin/env bash
# Devnet smoke outline: create_plan -> approve (delegate) -> subscribe -> charge -> cancel.
# Devnet only. Does NOT deploy or move real funds by itself: there is NO TS
# client (scripts/smoke-client.ts does not exist), so each phase prints the
# exact command it WOULD run and exits 0. Safe to run at any time.
#
# Real flow (proves the outline works), executed by hand on devnet 2026-10-08:
#   program   2jK5cy3PaCnD2cLfp3VCqxySBx4dyDhBc7GuutACvJuw
#   merchant  3XiJMwuXomxsu5w18unCUfc2SuUyqJVfafmwmgWLpYch | plan_id=5
#   mint      8bL6dZeBVExJZBwozjfg36XeRGA4GPMYWJ6VpyGXPTX
#   charge-tx 36faTWSe9Bwkug7Xkcdaeaazo1SzTJJ1xcmJuyC8yBho3u3AWBdsiG7tVyE7HWdvP3rqD8nQanRfDrPNGDUV9pcS (slot 508789424)
#   explorer  https://explorer.solana.com/tx/36faTWSe9Bwkug7Xkcdaeaazo1SzTJJ1xcmJuyC8yBho3u3AWBdsiG7tVyE7HWdvP3rqD8nQanRfDrPNGDUV9pcS?cluster=devnet
# This script does NOT automate that flow — replay it by hand from the phases below.
#
# Usage:
#   PROGRAM_ID=<PROGRAM_ID> MINT=<MINT> ./scripts/smoke.sh [--keypair <PATH>] [--rpc-url <URL>]
#     [--merchant <PUBKEY>] [--subscriber <PUBKEY>] [--plan-id 1] [--period 30] [--amount <RAW>]
#
# Env overrides: PROGRAM_ID (required), MINT (required), KEYPAIR, RPC_URL,
#   MERCHANT, SUBSCRIBER, PLAN_ID, PERIOD_SECONDS, CHARGE_AMOUNT.
# Placeholders: <PROGRAM_ID>, <MINT>, <SUB_PDA>, <PLAN_PDA>.
# Tip: the program rejects period_seconds < 30 (PeriodTooShort); the fastest
#   reachable charge() uses the 30 s floor (charge requires now >= last_paid_at + period).
set -euo pipefail

KEYPAIR="${KEYPAIR:-/root/.config/solana/deploy-keypair.json}"
RPC_URL="${RPC_URL:-https://api.devnet.solana.com}"
PROGRAM_ID="${PROGRAM_ID:-}"
MINT="${MINT:-}"
MERCHANT="${MERCHANT:-}"
SUBSCRIBER="${SUBSCRIBER:-}"
PLAN_ID="${PLAN_ID:-1}"
PERIOD_SECONDS="${PERIOD_SECONDS:-30}"
CHARGE_AMOUNT="${CHARGE_AMOUNT:-}"
CLIENT="scripts/smoke-client.ts"

usage() {
  sed -n '2,23p' "$0"
  echo "Current: PROGRAM_ID=${PROGRAM_ID:-<PROGRAM_ID>} MINT=${MINT:-<MINT>}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keypair) KEYPAIR="$2"; shift 2 ;;
    --rpc-url) RPC_URL="$2"; shift 2 ;;
    --merchant) MERCHANT="$2"; shift 2 ;;
    --subscriber) SUBSCRIBER="$2"; shift 2 ;;
    --plan-id) PLAN_ID="$2"; shift 2 ;;
    --period) PERIOD_SECONDS="$2"; shift 2 ;;
    --amount) CHARGE_AMOUNT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$RPC_URL" in
  *devnet*) ;;
  *) echo "Refusing: RPC_URL is not devnet ($RPC_URL)." >&2; exit 1 ;;
esac
[[ -n "$PROGRAM_ID" ]] || { echo "Missing PROGRAM_ID. Usage: PROGRAM_ID=<PROGRAM_ID> MINT=<MINT> ./scripts/smoke.sh" >&2; exit 2; }
[[ -n "$MINT" ]] || { echo "Missing MINT. Create one: ./scripts/create-test-mint.sh" >&2; exit 2; }

DEPLOY_ADDR="$(solana address -k "$KEYPAIR")"
MERCHANT="${MERCHANT:-$DEPLOY_ADDR}"
SUBSCRIBER="${SUBSCRIBER:-$DEPLOY_ADDR}"

have_client=0
[[ -f "$CLIENT" ]] && have_client=1

phase() { echo; echo "=== [$1] $2 ==="; }
run_or_print() {
  # $1 = phase name, $2.. = placeholder TS invocation + $EXTRA = shell equivalent
  local name="$1"; shift
  if [[ "$have_client" -eq 1 ]]; then
    echo "\$ npx ts-node $CLIENT $*"
    npx ts-node "$CLIENT" "$@"
  else
    echo "SKIP (placeholder — $CLIENT not yet implemented)."
    echo "Would run: npx ts-node $CLIENT $*"
    [[ -n "${EXTRA:-}" ]] && echo "$EXTRA"
  fi
}

echo "Program: $PROGRAM_ID | Mint: $MINT | merchant: $MERCHANT subscriber: $SUBSCRIBER"
echo "plan_id=$PLAN_ID period=${PERIOD_SECONDS}s amount=${CHARGE_AMOUNT:-<plan amount>}"

phase 1 "create_plan (merchant)"
EXTRA="# PDA: findProgramAddress([b\"plan\", merchant, plan_id_le8], $PROGRAM_ID) → <PLAN_PDA>" \
  run_or_print create-plan --program-id "$PROGRAM_ID" --mint "$MINT" \
    --merchant "$MERCHANT" --plan-id "$PLAN_ID" --period "$PERIOD_SECONDS" \
    ${CHARGE_AMOUNT:+--amount "$CHARGE_AMOUNT"}

phase 2 "approve delegate off-chain (subscriber approves Sub PDA)"
# Model B: delegate authority is the Subscription PDA (seeds: b"sub", plan, subscriber).
echo "Would run (exact spl-token form once <SUB_PDA> is known):"
echo "  spl-token approve <SUBSCRIBER_ATA> ${CHARGE_AMOUNT:-<AMOUNT>} <SUB_PDA> \\"
echo "    --owner <SUBSCRIBER_KEYPAIR> --url $RPC_URL"
EXTRA="# TS equivalent: approve(subscriberAta, subPda, amount) signed by subscriber" \
  run_or_print approve --program-id "$PROGRAM_ID" --mint "$MINT" --subscriber "$SUBSCRIBER"

phase 3 "subscribe (subscriber)"
EXTRA="# PDA: findProgramAddress([b\"sub\", plan, subscriber], $PROGRAM_ID) → <SUB_PDA>" \
  run_or_print subscribe --program-id "$PROGRAM_ID" --plan-id "$PLAN_ID" \
    --subscriber "$SUBSCRIBER"

phase 4 "charge (anyone; Sub-PDA-signed transfer_checked)"
echo "# Note: charge() requires now >= last_paid_at + period; with --period $PERIOD_SECONDS"
echo "# this means waiting ~${PERIOD_SECONDS}s after subscribe before charging."
EXTRA="# On-chain: transfer_checked(subscriberAta -> merchantAta, amount, mint.decimals) signed by <SUB_PDA>" \
  run_or_print charge --program-id "$PROGRAM_ID" --plan-id "$PLAN_ID" \
    --subscriber "$SUBSCRIBER"
phase 6 "create_invoice (merchant; memo_hash = sha256 off-chain metadata)"
EXTRA="# PDA: findProgramAddress([b\"invoice\", sub, invoice_id_le8], $PROGRAM_ID) → <INVOICE_PDA>" \
  run_or_print create-invoice --program-id "$PROGRAM_ID" --plan-id "$PLAN_ID" \
    --subscriber "$SUBSCRIBER" --invoice-id 1 --memo "<SHA256_HEX>"

phase 7 "charge_invoice (merchant; delegate-signed transfer_checked + receipt)"
echo "# Same clock gate as charge(): now >= last_paid_at + period."
EXTRA="# On-chain: transfer_checked + invoice=Paid, paid_at=now; emits InvoiceCharged" \
  run_or_print charge-invoice --program-id "$PROGRAM_ID" --plan-id "$PLAN_ID" \
    --subscriber "$SUBSCRIBER" --invoice-id 1

phase 8 "report (read-only receipt)"
echo "Would run:"
echo "  curl \"$RPC_URL\" # getAccountInfo <INVOICE_PDA> → decode 194B layout → receipt JSON"
EXTRA="# Anyone recomputes sha256(metadata) and compares with memo_hash" \
  run_or_print report --program-id "$PROGRAM_ID" --invoice "<INVOICE_PDA>"

phase 9 "cancel + revoke (subscriber)"

echo
if [[ "$have_client" -eq 1 ]]; then echo "Smoke client ran all phases."; else
  echo "Smoke outline complete (all phases SKIP — placeholders). No state changed."
fi
