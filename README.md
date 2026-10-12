# OnchainSUB

**OnchainSUB** is an on-chain subscription protocol on **Solana devnet**: a merchant
creates a plan, a subscriber approves the subscription PDA as an SPL-Token
delegate, and the protocol charges the subscriber per billing period.

> **Status: hackathon prototype.** This is a work-in-progress prototype built for
> the **Colosseum** hackathon. It runs on **Solana devnet only** — no mainnet
> deployment, no real users, no revenue, no audit. Do not use it with real funds.

- Live demo (devnet): **<https://solhack.rafal.si>**
- Solana program id (devnet): `2jK5cy3PaCnD2cLfp3VCqxySBx4dyDhBc7GuutACvJuw`
- Protocol design: [`DESIGN.md`](DESIGN.md) · Threat model: [`THREAT.md`](THREAT.md) · Deploy runbook: [`DEPLOY.md`](DEPLOY.md)

## What it does

Model **B (delegate + `transfer_checked`)**:

1. The merchant calls `create_plan` and registers a billing plan (mint, amount, period).
2. The subscriber `approve()`s the Subscription PDA as an SPL-Token delegate
   (off-chain signature, on-chain vault state).
3. `charge()` CPIs `transfer_checked` with the PDA as signer, moving funds for the period.
4. `cancel()` ends the subscription.

The subscription state machine, PDAs and instruction accounts are specified in
[`DESIGN.md`](DESIGN.md); the invariants (I1–I11) and attack catalogue (A1–A15)
live in [`THREAT.md`](THREAT.md).

## Architecture

```text
internet
  │  https://solhack.rafal.si (prod) / http://localhost:3725 (local)
  ▼
frontend :3725 (public)             Astro 5 + Svelte 5, standalone Node
  │  src/pages/api/[...path].ts — proxies /api/* 1:1 (method + query + body)
  ▼
backend :3001 (internal)            Hono on Bun
  ├── /api/actions/*  → @subscriptions/actions handlers (Blinks)
  ├── /api/invoices/* → invoice metadata / charges (Postgres), cached in Redis
  └── /health         → { ok, db, redis }
  ├── postgres :5432 (invoice data, DDL: backend/db-init/001.sql)
  └── redis :6379 (metadata cache, TTL 30 s)

contracts: subscriptions/ (Anchor 0.31.1, devnet) — runs outside Compose
actions:   actions/ (Solana Actions/Blinks, framework-free)
media:     media (RustFS, S3-compatible) — `/media/<key>` on the app domain
```

## Ports

| Service  | Host port | Internal port | Access                                    |
|----------|-----------|---------------|-------------------------------------------|
| frontend | **3725**  | 4321          | public (prod: `solhack.rafal.si`)         |
| backend  | —         | 3001          | Compose network only (`http://backend:3001`) |
| postgres | —         | 5432          | Compose network only                      |
| redis    | —         | 6379          | Compose network only                      |
| media    | —         | 9000          | Compose network only (proxied at `/media/`) |

Local dev without Docker: frontend `http://localhost:4321`, backend `http://localhost:3001`.

## Run it

Prerequisites: [Bun](https://bun.sh) `>= 1.1` and Docker (with Compose v2).

```sh
# 1. Configure secrets — copy the template and fill in placeholders.
cp .env.example .env

# 2. Install workspace deps.
bun install

# 3. Bring up the whole stack (postgres, redis, media, backend, frontend).
bun run stack:up          # == docker compose up -d --build
```

`bun run stack:up` is exactly `docker compose up -d --build`; use either form.

Useful follow-ups:

```sh
bun run stack:logs        # docker compose logs -f
bun run stack:down        # docker compose down
docker compose ps
```

Health checks:

```sh
curl -s http://localhost:3725/api/actions/report -o /dev/null -w '%{http_code}\n'  # 400 = proxy alive
curl -s http://localhost:3725/api/actions/report | head -c 200
```

Production serves the same frontend container at `https://solhack.rafal.si`.
`PUBLIC_SITE_URL` is baked into the bundle at build time (`frontend/.env`), so
changing the domain requires a frontend rebuild. `BACKEND_URL` is server-side
only (`process.env`, never `import.meta.env`) — in Compose it is `http://backend:3001`.

## Tests

| What | Command | Where it runs |
|------|---------|---------------|
| Backend tests | `docker compose exec -T backend bun run test` | `backend` container (live Redis required) |
| Frontend build (includes typecheck) | `cd frontend && bun run build` | `frontend/` |
| End-to-end (Playwright) | `cd e2e && bunx playwright test` | against `http://localhost:3725` (frontend → proxy → backend) |
| Backend typecheck | `cd backend && bun run typecheck` | `backend/` |
| Actions typecheck | `cd actions && bun run typecheck` | `actions/` |
| Program (Anchor) | `cd subscriptions && anchor test` | Solana devnet (see [`DEPLOY.md`](DEPLOY.md)) |
| On-chain smoke | `./scripts/smoke.sh --help` | `create_plan → approve → subscribe → charge → cancel` |

Root shortcuts: `bun run backend:test`, `bun run web:build`, `bun run e2e`,
`bun run web:check`, `bun run backend:check`, `bun run actions:typecheck`.

The e2e suite covers the frontend language/proxy smoke path and the detail views
(proofs table, FAQ, simulator tabs, `?demo=1`, admin hidden by default), driven
through the frontend proxy so frontend and backend are exercised together.

## Configuration

All secrets live in `.env` (gitignored). [`.env.example`](.env.example) lists
every variable with placeholder values only.

| Variable | Purpose |
|----------|---------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres credentials for the backend |
| `SOLANA_DEVNET_RPC` / `SOLANA_TESTNET_RPC` | RPC endpoints (use your own provider key) |
| `CLUSTER` | Solana cluster, `devnet` for this prototype |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `MAIL_FROM_NAME` | Outbound mail for invoice notifications |
| `MAIL_TEST_TOKEN` | Token guarding the test-mail endpoint |
| `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` | RustFS (S3-compatible) media credentials |
| `HELIUS_API_KEY` | Helius devnet RPC key; read from the environment by the demo bootstrap scripts |
| `HELIUS_WEBHOOK_SECRET` | Shared secret for Helius webhook deliveries |

Never commit real values: `.gitignore` excludes `.env`, `.env.*` and keeps only
`.env.example` tracked.

## Media (RustFS, local)

`compose.yml` runs **RustFS** (S3-compatible) as service `media`, so media is
served from the same origin as the API.

- Read path: **`/media/<key>`** on the app domain (frontend proxies to the store,
  read-only, `Cache-Control: public, max-age=86400` by default).
- Write path: any S3 client using `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` from
  `.env`. The proxy never accepts writes.
- Bootstrap (bucket + anonymous GET + optional seed dir):
  `./scripts/media-init.sh` or `./scripts/media-init.sh --sync ./public/art`.

```bash
source <(grep '^RUSTFS_' .env | sed 's/^/export /')
docker run --rm --network solhack_default -v "$PWD":/work \
  -e AWS_ACCESS_KEY_ID=$RUSTFS_ACCESS_KEY -e AWS_SECRET_ACCESS_KEY=$RUSTFS_SECRET_KEY \
  amazon/aws-cli:latest s3 cp public/favicon.svg s3://media/art/favicon.svg \
  --endpoint-url http://media:9000
# → https://<domain>/media/art/favicon.svg
```

## Docs map

| File | Scope |
|------|-------|
| `DESIGN.md` | on-chain protocol (PDAs, instructions, state machine) |
| `THREAT.md` | invariants I1–I11, attacks A1–A15 |
| `DEPLOY.md` | Anchor deploy runbook on devnet (program, mint, smoke) |
| `backend/README.md` | routes `/health`, `/api/actions/*`, `/api/invoices/*` |
| `frontend/README.md` | pages, `/api/*` proxy, Svelte islands, env |
| `actions/README.md` | Blinks handlers, endpoint params, devnet vs mainnet |
| `frontend/.env.example` | frontend env template (`PUBLIC_SITE_URL`, `BACKEND_URL`) |

## Deploying the program

```sh
cd subscriptions && anchor build && anchor deploy
```

After `anchor deploy`, replace the placeholder program id
(`SubScribe1111111111111111111111111111111111`) in `frontend/.env` and
`actions/src/config.ts`, or pass `?programId=` per request. The devnet program id
used by the live demo is `2jK5cy3PaCnD2cLfp3VCqxySBx4dyDhBc7GuutACvJuw`.

## License

MIT — see [`LICENSE`](LICENSE).
