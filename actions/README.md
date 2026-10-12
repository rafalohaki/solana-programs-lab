# Actions (Blinks) API

Framework-free Solana Actions handlers for the subscriptions program (Model B:
user `approve()`s the Subscription PDA as SPL delegate off-chain; `charge()`
CPIs `transfer_checked` with the Subscription PDA as signer).

## Layout

| File | Route | Builds |
|---|---|---|
| `src/routes/plan.ts` | `GET/POST /api/actions/plan` | `create_plan` |
| `src/routes/subscribe.ts` | `GET/POST /api/actions/subscribe` | `approve` + `subscribe` |
| `src/routes/cancel.ts` | `GET/POST /api/actions/cancel` | `revoke` + `cancel` |
| `src/routes/invoice.ts` | `GET/POST /api/actions/invoice` | `create_invoice` (merchant; memo_hash pins metadata) |
| `src/routes/batch.ts` | `GET/POST /api/actions/batch` | N × `charge_invoice` in one tx (cap 8) |
| `src/routes/report.ts` | `GET /api/actions/report?invoice=<pda>` | verifiable receipt JSON (read-only) |
| `actions.json` | serve at site root | chain mapping |

`src/config.ts` holds the **⚠️ placeholder program id**
(`SUBSCRIPTIONS_PROGRAM_ID`). Replace it after `anchor deploy`, or override
per-request with `?programId=<deployed-id>`. Mint, plan, subscriber, and
merchant addresses are always query/body parameters — never hardcoded.

## Blink wiring

1. Copy `actions.json` to the **site root** (e.g. Next.js `public/actions.json`
   so it serves at `https://<host>/actions.json`). It maps
   `/api/actions/**` to a chain id:
   ```json
   { "rules": [{ "pathPattern": "/api/actions/**", "apiChainId": "solana:devnet" }] }
   ```
2. Mount each route, e.g. `app/api/actions/subscribe/route.ts`:
   ```ts
   import { handleSubscribeGet, handleSubscribePost, optionsResponse } from "@subscriptions/actions";
   export const OPTIONS = optionsResponse;
   export async function GET(req: Request) { return handleSubscribeGet(req); }
   export async function POST(req: Request) { return handleSubscribePost(req); }
   ```
   Handlers use only Web-standard `Request`/`Response` plus
   `@solana/web3.js` + `@solana/spl-token`, so they work in Next.js, Remix,
   or plain Node (`node --experimental-strip-types` / `tsx`).
3. Every handler sets CORS (`*`, `GET,POST,PUT,OPTIONS`) and
   `Content-Type: application/json` per the Actions spec.
4. Share the Blink URL: `https://dial.to/?action=solana-action:https://<host>/api/actions/subscribe?plan=<plan>&mint=<mint>&amount=<raw>&cluster=devnet`.

Wallet flow: wallet `GET`s the URL (renders title/description/button) →
user taps → wallet `POST`s `{ account: <wallet-pk> }` → handler returns
`{ type: "transaction", transaction: <base64 unsigned tx>, message }` →
wallet signs and sends. The server never signs.

## Endpoint parameters

- `plan.subscribe`: `?plan=<plan-pda>&mint=<spl-mint>&amount=<one-period raw units>&cluster=…`.
  POST `approve(subscriberAta → subscriptionPDA, amount)` + `subscribe`, fee payer = subscriber.
- `plan.cancel`: `?plan=<plan-pda>&mint=<spl-mint>`. POST
  `revoke(subscriberAta)` + `cancel`; the program also revokes via CPI when an allowance remains.
- `plan.charge`: `?plan=<plan-pda>&subscriber=<pk>&mint=<spl-mint>&merchant=<merchant-pk>&cluster=…`.
  **Merchant-only note:** pass `&merchant=<plan.merchant>`; the handler rejects callers that do not match
  it. Even without the hint, value cannot be stolen — the program pays the plan's merchant ATA,
  enforces `status == Active` and `now >= last_paid_at + period`, and advances `last_paid_at`.
  Gate the button to the merchant in the UI.
- `plan.create`: `?merchant=<pk>&planId=<u64>&mint=<mint>&amount=<raw>&period=<seconds>`.
- `invoice.create`: `?plan=<plan-pda>&subscription=<sub-pda>&invoiceId=<u64>&memo=<64-hex>&cluster=…`.
  POST body `account` = merchant. `memo` = sha256 hex over the off-chain invoice metadata.

- `invoice.report`: `GET ?invoice=<pda>&cluster=…`. Returns the receipt; recompute sha256(metadata)
  and compare with `memoHash` — match + `status: "Paid"` = settled proof.
- `invoice.batch`: POST body `{ account, items: [{ plan, subscription, invoice, subscriberAta, mint }] }`
  (1–8 items). Builds one `charge_invoice` per item; merchant signs once. Merchant ATAs derived per mint.

## Collection fee (40 bps)

Every `charge` / `charge_invoice` splits the plan amount on-chain:
`(amount - fee)` → merchant ATA, `fee = floor(amount * 40 / 10000)` → the
treasury ATA owned by `2p1sPBmViJjKhUM1aKCsd25nayKeXRJnpmJAWwfYbucP`
(per mint; `TREASURY_WALLET` / `treasuryAtaForMint()` in `src/solana.ts`).
Dust amounts whose fee floors to 0 send the full amount to the merchant.
`chargeIx` / `chargeInvoiceIx` append the `treasury` + `treasuryAta` keys in
`Charge` / `ChargeInvoice` field order and default `treasuryAta` to the
derived address, so the charge/batch routes build valid txs unchanged.

## Merchant treasury (multisig)

- `plan.merchant` is any pubkey — including a Squad vault address. PDA
  derivation and the charge flow are unchanged (no protocol code needed).
- `charge()` needs the merchant key as signer: with a Squad vault, charges
  execute through Squad proposals (the vault PDA signs via the Squads
  program). Vault-PDA-as-signer is not yet exercised on devnet — operator-key
  charging is the tested path; multisig remains an honest roadmap item.

## Devnet vs mainnet
- `actions.json` ships with `"apiChainId": "solana:devnet"`.
  For a mainnet Blink, change it to `"solana:mainnet"` (genesis `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9`)
  and pass `?cluster=mainnet-beta` (RPC from `SOLANA_MAINNET_RPC`).
  Devnet genesis is `EtW6BPJqKBkqHCPNyN1A6a8qgQDLwVoEMhfVtgzu` (`solana:devnet`);
  testnet is `4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2Ns` (`solana:testnet`).
- Never mix: devnet program ids/mints/plan PDAs are invalid on mainnet.
  Re-derive PDAs per cluster (`findPlanPda` / `findSubscriptionPda` take `programId` explicitly).

## Env

```sh
SOLANA_DEVNET_RPC=https://api.devnet.solana.com      # optional; falls back to public endpoints
SOLANA_TESTNET_RPC=…
SOLANA_MAINNET_RPC=…
npm run typecheck
```
