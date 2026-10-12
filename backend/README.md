# @subscriptions/backend
Hono API on Bun: Solana Actions proxy + invoice metadata/charges (Postgres) with Redis cache.
`bun install` then `bun run dev` (PORT 3001); empty DATABASE_URL/REDIS_URL = degraded mode.
Routes: /health, /api/actions/*, /api/invoices/metadata, /api/invoices/charges,
/api/widget/* (details: "Widget domain binding" below).
GET /api/invoices/charges takes `invoice=` (per-invoice list, unchanged) or
`merchant=` (COUNT+SUM rollup via JOIN on invoice_metadata; charges without a
metadata row are excluded, never mocked). GET /api/stats/volume = SUM+COUNT
over invoice_charges; GET /api/stats/fees = `{fees,gross,count}` derived live from
invoice_charges gross at 40 bps (bigint; no stored fee column yet). Batch POST bodies are
gated 1–8 items by Effect Schema (`src/schema.ts`) plus the actions check.
DDL: db-init/001.sql + 002.sql (widget) + 003.sql (rollup indexes); drizzle schema in src/db/schema.ts.

## Widget domain binding — merchant signature required
`POST /api/widget/sites` (`src/widget.ts`, mounted at `/api/widget`) binds
`(merchant, domain, plan)` and requires the merchant's **ed25519 signature +
timestamp** on top of the RPC ownership check. Canonical message — sign EXACTLY
this UTF-8 string (`widgetBindMessage`):

```
onchainsub widget-bind
merchant:<merchant>
domain:<domain>
plan:<plan>
ts:<timestamp>
```

- `domain` must be pre-normalized server-style (`normalizeHost`: lowercase,
  port/IPv6 brackets stripped, trailing dot removed) — the client signs the
  same normalized string the backend stores.
- `timestamp` is ms epoch, accepted within **±10 minutes** of server time
  (`SIGNATURE_WINDOW_MS` replay window).
- `signature` is base58 (Bitcoin alphabet) of the 64-byte ed25519 signature,
  verified with `tweetnacl.sign.detached.verify` using the in-file base58
  decoder (dep: `tweetnacl`). Failures answer **401** with a generic,
  non-sensitive message; malformed fields answer 400.
- Layer 2 (defense in depth): the plan account is then read from RPC and
  `plan.merchant` must equal the signing merchant, else **403**.
- The dApp flow signs via the connected wallet (`signMessage` in
  `frontend/src/lib/wallet.ts`, called by EmbedPanel); demo mode (`?demo=1`)
  skips signing client-side, so it cannot bind against a live backend.

curl (signature value illustrative):

```bash
curl -X POST http://localhost:3001/api/widget/sites \
  -H 'content-type: application/json' \
  -d '{"merchant":"<MERCHANT_PUBKEY>","domain":"shop.example.com","plan":"<PLAN_PUBKEY>","timestamp":1728300000000,"signature":"<BASE58_ED25519_SIGNATURE>"}'
```

## Mail (SMTP receipts)

Proton SMTP, STARTTLS on :587. Enabled only when `SMTP_USER` + `SMTP_PASS` are
set — without them the module is inert and `/api/mail/status` reports
`enabled: false` (local dev / CI never connects).

| Env | Meaning |
|---|---|
| `SMTP_HOST` / `SMTP_PORT` | default `smtp.protonmail.ch` / `587` |
| `SMTP_USER` / `SMTP_PASS` | mailbox + Proton SMTP **token** (not the login password) |
| `SMTP_FROM` | sender override (default = `SMTP_USER`) |
| `MAIL_FROM_NAME` | display name (default `OnchainSUB`) |
| `MAIL_TEST_TOKEN` | shared secret required by `POST /api/mail/test` |
| `RECEIPT_DECIMALS` | decimals used to format receipt amounts (default 6) |

Behaviour:

- `GET /api/mail/status` — `{enabled, host, port, from}` without secrets.
- `POST /api/mail/test` — body `{to}`; requires header `x-mail-token` matching
  `MAIL_TEST_TOKEN` (503 when the env is unset = feature off).
- **Receipts**: every successful `POST /api/invoices/charges` looks up the
  invoice metadata; when `metadata.notifyEmail` holds a valid address, a
  branded receipt (amount, plan, cluster, explorer link) is sent
  asynchronously — mail failures are logged and never fail the charge call.

Store `notifyEmail` through the existing metadata upsert:

```bash
curl -X POST "$BASE/api/invoices/metadata" -H 'content-type: application/json' -d '{
  "invoice": "INV-2026-0001",
  "merchant": "<merchant pubkey>",
  "metadata": { "notifyEmail": "customer@example.com" }
}'
```
