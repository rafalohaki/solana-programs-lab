# Deploy runbook — subscriptions (devnet)

Target cluster: **devnet only**. No mainnet steps in this file.
Model: **B (delegate + `transfer_checked`)** — subscriber `approve()`s the Subscription PDA as
SPL-Token delegate off-chain; `charge()` CPIs `transfer_checked` with the Sub PDA as signer.

> Provisional toolchain (see table below). If the toolchain scout broadcasts a revision on
> `agent://all`, follow that instead.

## 0. Toolchain

| Tool | Expected | Observed 2026-10-05 |
|---|---|---|
| `solana-cli` | 2.2.x | 2.2.11 (Agave) ✅ |
| `anchor-cli` / `avm` | 0.31.1 (`anchor-lang` + `anchor-spl` 0.31.1) | not installed — see §2 |
| `rustc` | 1.90 | 1.90.0 ✅ |
| `node` | 24 | v24.13.1 ✅ |
| `spl-token` CLI | any recent | not installed — see §6 |
| RPC | `https://api.devnet.solana.com` | already configured ✅ |
| Deploy keypair | `/root/.config/solana/deploy-keypair.json` | exists, addr `3XiJMwuXomxsu5w18unCUfc2SuUyqJVfafmwmgWLpYch` ✅ |

Workspace layout (owned by sibling agents; referenced here, do not create from this file):

```text
subscriptions/programs/subscriptions/src/
  lib.rs  state.rs  errors.rs  events.rs
  instructions/{create_plan.rs,subscribe.rs,charge.rs,cancel.rs}
subscriptions/tests/**
actions/**
scripts/{create-test-mint.sh,fund.sh,smoke.sh}   # this agent owns
```

PDA seeds (authoritative): Plan `[b"plan", merchant_pubkey, plan_id_le8]`,
Subscription `[b"sub", plan_pubkey, subscriber_pubkey]`.

## 1. Pre-deploy checklist

- [ ] `solana config get` shows RPC `https://api.devnet.solana.com` and keypair
      `/root/.config/solana/deploy-keypair.json` (§3).
- [ ] Deploy keypair funded (≥ ~2 SOL devnet; `solana balance`, else `./scripts/fund.sh`) (§3).
- [ ] `anchor --version` prints `0.31.1` (§2).
- [ ] `Anchor.toml` has `[provider] cluster = "devnet"`, wallet = deploy keypair path (§4).
- [ ] Program ID wired in **both** `declare_id!` (`lib.rs`) and `Anchor.toml`
      `[programs.devnet]` after first build (§4). Rebuilt after wiring.
- [ ] Placeholders resolved: `<PROGRAM_ID>`, `<MINT>`, `<MERCHANT>`, `<SUBSCRIBER>`.

## 2. Install Anchor 0.31.1 (once per machine)

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.31.1
avm use 0.31.1
anchor --version   # expect: anchor-cli 0.31.1
```

## 3. Configure Solana CLI (devnet)

```bash
solana config set --url https://api.devnet.solana.com \
  --keypair /root/.config/solana/deploy-keypair.json
solana config get
solana address -k /root/.config/solana/deploy-keypair.json
solana balance --url https://api.devnet.solana.com
```

Fund when low (see `scripts/fund.sh`):

```bash
./scripts/fund.sh                        # 1 SOL to deploy-keypair address
./scripts/fund.sh --address <PUBKEY> --amount 2
```

If the public devnet faucet is rate-limited, retry with back-off or use
`https://faucet.solana.com`. Never substitute mainnet.

## 4. Program ID update steps

Anchor needs a keypair at `target/deploy/subscriptions-keypair.json`. First build
generates it; then wire the address in two places and rebuild.

```bash
cd /root/solana-programs-lab/subscriptions   # workspace with Anchor.toml
anchor build                                  # generates target/deploy/subscriptions-keypair.json
solana address -k target/deploy/subscriptions-keypair.json   # → <PROGRAM_ID>
```

Then:

1. In `programs/subscriptions/src/lib.rs`, set the program address:
   `declare_id!("<PROGRAM_ID>");`
2. In `Anchor.toml`:
   ```toml
   [provider]
   cluster = "devnet"
   wallet = "/root/.config/solana/deploy-keypair.json"

   [programs.devnet]
   subscriptions = "<PROGRAM_ID>"
   ```
3. Sync + rebuild:
   ```bash
   anchor keys sync
   anchor build
   grep -r "<PROGRAM_ID>" programs/ Anchor.toml || true  # sanity: no stale placeholder
   solana address -k target/deploy/subscriptions-keypair.json
   ```

Historical note: `anchor init` scaffolds a random `declare_id!`. The steps above
replace it with the real devnet keypair. Never invent an address — always read it
from the keypair file.

## 5. Build

```bash
cd /root/solana-programs-lab/subscriptions
anchor build
ls -la target/deploy/subscriptions.so target/idl/subscriptions.json
```

## 6. Deploy to devnet

```bash
cd /root/solana-programs-lab/subscriptions
anchor deploy --provider.cluster devnet \
  --provider.wallet /root/.config/solana/deploy-keypair.json
```

Equivalent raw-CLI fallback (same keypair, devnet only):

```bash
solana program deploy target/deploy/subscriptions.so \
  --program-id target/deploy/subscriptions-keypair.json \
  --url https://api.devnet.solana.com \
  --keypair /root/.config/solana/deploy-keypair.json
```

Re-deploy upgrades in place (same program ID, upgrade authority = deploy keypair).
Closing programs/buffers (`solana program close`) is out of scope for this runbook.

## 7. Verify

```bash
PROGRAM_ID=<PROGRAM_ID>   # placeholder: paste address from §4

solana program show "$PROGRAM_ID" --url https://api.devnet.solana.com

# IDL round-trip (Anchor 0.31): fetch on-chain IDL and diff against the build artifact
anchor idl fetch "$PROGRAM_ID" --provider.cluster devnet -o /tmp/subscriptions-fetched.json
diff target/idl/subscriptions.json /tmp/subscriptions-fetched.json && echo IDL-OK
```

If `anchor idl fetch` flag order differs in your install, run `anchor idl --help`
(the program ID operand and `-o/--out` + `--provider.cluster devnet` are what matter).
First deploy on a fresh program ID may require `anchor idl init` instead of fetch/update;
follow the CLI error text, keeping `--provider.cluster devnet` and the same wallet.

## 8. Test mint, funding, smoke test

```bash
./scripts/create-test-mint.sh --help
./scripts/create-test-mint.sh --decimals 6 --amount 1000 \
  --merchant <MERCHANT_PUBKEY> --subscriber <SUBSCRIBER_PUBKEY>
# → prints MINT address; export it for the smoke test:
export MINT=<MINT>

./scripts/smoke.sh --help
PROGRAM_ID=<PROGRAM_ID> MINT=<MINT> ./scripts/smoke.sh
```

`smoke.sh` is an outline, not an automated client: `scripts/smoke-client.ts`
does not exist, so each phase prints the exact command it *would* run and
exits 0. The outline was proven by a real manual flow on devnet 2026-10-08
(program `2jK5cy3PaCnD2cLfp3VCqxySBx4dyDhBc7GuutACvJuw`, merchant
`3XiJMwuXomxsu5w18unCUfc2SuUyqJVfafmwmgWLpYch`, mint
`8bL6dZeBVExJZBwozjfg36XeRGA4GPMYWJ6VpyGXPTX`, plan_id=5, charge-tx
`36faTWSe9Bwkug7Xkcdaeaazo1SzTJJ1xcmJuyC8yBho3u3AWBdsiG7tVyE7HWdvP3rqD8nQanRfDrPNGDUV9pcS`,
slot 508789424 —
`https://explorer.solana.com/tx/36faTWSe9Bwkug7Xkcdaeaazo1SzTJJ1xcmJuyC8yBho3u3AWBdsiG7tVyE7HWdvP3rqD8nQanRfDrPNGDUV9pcS?cluster=devnet`).
Replay it by hand from the printed phases; the script automates nothing.

Period floor: `create_plan` rejects `period_seconds < 30`
(`PeriodTooShort`); the fastest reachable `charge()` uses a 30 s test plan.
`charge()` enforces `now >= last_paid_at + period`, so wait ~30 s after
`subscribe` before charging.

After recording a real charge, verify it is counted:

```bash
curl http://localhost:3001/api/stats/volume   # → {"volume":"<SUM>","count":<N>}
```

A manual `POST /api/invoices/charges` requires split fields: `signature`
carries the Solana transaction signature (verified on-chain), while the
merchant's ed25519 over the canonical `receipt-bind` message travels in the
separate `authSignature` field:

```text
onchainsub receipt-bind
merchant:<merchant>
invoice:<invoice>
amount:<lamports>
sig:<tx signature>
ts:<ms epoch>
```

One field cannot serve both roles — sharing them fails (missing
`authSignature` answers 400, a wrong one 401). See `backend/src/routes.ts`
("Body-field split").

## 9. Post-deploy checklist

- [ ] `solana program show <PROGRAM_ID> --url https://api.devnet.solana.com` succeeds.
- [ ] Fetched IDL matches `target/idl/subscriptions.json`.
- [ ] Explorer (devnet): `https://explorer.solana.com/address/<PROGRAM_ID>?cluster=devnet`
      (transactions: `https://explorer.solana.com/tx/<SIGNATURE>?cluster=devnet`).
- [ ] Actions/Blinks: serve `actions/**` over HTTPS, then verify each Blink with
      `https://dial.to/?action=solana-action:<ACTIONS_BASE_URL>/api/<ROUTE>`
      and the Solana Actions inspector (`actions.dialect.to` / `@solana/actions` CLI).
      Until Actions code lands, record the base URL as placeholder `<ACTIONS_BASE_URL>`.
- [ ] Smoke phases green (§8); record mint, plan ID, and subscription PDA in the deploy log.

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `airdrop` rate-limited | wait + `./scripts/fund.sh --amount 1`; or `https://faucet.solana.com` |
| `anchor: command not found` | §2 (`avm use 0.31.1` each new shell if needed) |
| `anchor build` version mismatch | ensure `anchor-lang`/`anchor-spl = "0.31.1"` in `programs/subscriptions/Cargo.toml` |
| `Error: ... IDL ... authority` | deploy wallet must equal IDL authority; use the same `--provider.wallet` |
| `smoke.sh` all `SKIP (placeholder)` | expected: no `scripts/smoke-client.ts` exists (§8); phases still print exact commands |
| scripts refuse with `not a devnet RPC` | `export RPC_URL=https://api.devnet.solana.com`; scripts never default to mainnet |
| `PeriodTooShort` on `create_plan` | period floor is 30 s (§8) — retry with `period_seconds >= 30` |
| `POST /api/invoices/charges` 400/401 | split fields (§8): tx signature in `signature`, merchant ed25519 in `authSignature` |

## Safety

Scripts default to devnet and refuse non-devnet RPCs unless explicitly overridden.
No script closes programs, drains wallets, or touches mainnet. Destructive operations
are intentionally absent from this runbook.
