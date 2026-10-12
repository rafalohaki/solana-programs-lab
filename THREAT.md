# Subscriptions — Threat Model

Model B: Subscription PDA is the SPL delegate; `charge()` CPIs
`transfer_checked` with PDA signer. Companion to `DESIGN.md` (seeds, structs,
instruction specs). Scope: `subscriptions/programs/subscriptions/src/**`.

## 1. Trust model

| Party | Trusted for | NOT trusted for |
|---|---|---|
| Program | per-period cap (`amount`), time gate, auth checks, PDA-signing correctness | anything off-chain (prices, keepers, wallets showing approve correctly) |
| Subscriber | approving the right PDA + amount, verifying `revoke()` after cancel | keeping allowance funded (may revoke/empty anytime — handled as charge failure, not an attack) |
| Merchant / keeper key | calling `charge()` at most when due; keeping its key secret | setting sane terms (amount/period/mint); nothing stops a merchant from creating an absurd plan — subscriber must read terms before approving |
| Token program + Clock sysvar | allowance accounting, decimals, timestamps | sub-second precision; exact slot timing |
| Keeper infra (if any) | liveness of `charge()` calls | custody — keeper holds merchant key, so compromise = merchant compromise; use a dedicated charge key per plan set if possible |

Attacker profiles: (a) malicious merchant draining more than agreed;
(b) malicious subscriber getting service without paying; (c) third party
(griefing, front-running, PDA confusion, CPI injection); (d) compromised
keeper key. No confidentiality assumptions — all state is public.

## 2. Invariants (all must hold; each is LiteSVM-testable)

1. **I1 — never charge cancelled.** `charge()` on `status == Cancelled`
   always fails, state untouched. *Test: cancel → charge → expect
   `SubscriptionCancelled`; balances unchanged.*
2. **I2 — never double-charge within a period.** Two `charge()` calls with
   `now < last_paid_at + period` on the second: second fails `TooEarly`,
   exactly one debit. *Test: charge, warp < period, charge → `TooEarly`.*
3. **I3 — only merchant charges.** `charge()` signer must equal
   `plan.merchant`; subscriber/random third party fails
   `UnauthorizedMerchant`. *Test: charge signed by subscriber → error.*
4. **I4 — only subscriber cancels.** `cancel()` signer must equal
   `subscription.subscriber`; merchant/third party fails
   `UnauthorizedSubscriber`. *Test: cancel signed by merchant → error.*
5. **I5 — delegate never moves more than `amount` per charge.** The sole
   funds-moving CPI is `transfer_checked(..., amount = plan.amount)` signed by
   the Subscription PDA; no instruction path transfers any other quantity.
   Standing allowances (`u64::MAX`) are still capped per-tx by this plus I2.
   *Test: standing MAX allowance → advance one period per charge → each debit
   == `amount` exactly.*
6. **I6 — subscription bound to its plan.** `subscription.plan == plan.key()`
   enforced on `charge()`/`cancel()` (`PlanMismatch`); cross-plan PDA reuse
   impossible. *Test: charge sub-A against plan-B accounts → `PlanMismatch`.*
7. **I7 — mint binding.** `subscriber_ata.mint == merchant_ata.mint ==
   mint == plan.mint` on every charge; wrong-mint ATAs rejected.
   *Test: charge with USDT ATA against USDC plan → constraint error.*
8. **I8 — cancel revokes.** After honest `cancel()` + confirmed tx,
   `subscriber_ata.delegate == None`. *Test: approve → cancel → read ATA
   delegate field == None.* (Requires honest wallet flow; see A6 for the
   revocation-race caveat.)
9. **I9 — invoice pays at most once.** `charge_invoice()` requires
   `status == Unpaid`, flips to `Paid` in the same handler after the CPI;
   `Paid`/`Voided` reject with `AlreadyPaid`. *Test: create → charge →
   charge → `AlreadyPaid`; balances move once.*
10. **I10 — invoice bound to its subscription.** `invoice.subscription ==
   subscription.key()` enforced (`InvoiceMismatch`); amount equality with
   the plan enforced (`InvalidAmount` on drift). *Test: charge invoice-A
   against subscription-B → `InvoiceMismatch`.*
11. **I11 — paid receipts immutable.** No instruction mutates a `Paid`
   invoice; `void_invoice()` rejects non-`Unpaid`. The receipt (event +
   `memo_hash`) is append-only history. *Test: void paid → `AlreadyPaid`.*
12. **I12 — fee capped below amount, legs sum exactly.** `fee =
   floor(amount · 40/10000) < amount` for every `amount ≥ 1` (u128 math, no
   overflow); the two CPIs move `amount − fee` and `fee`, so total debit ==
   `amount` and the merchant leg is never zero. No path moves more than
   `amount` per charge. *Test: split balances on 1_000_000 → 996_000 /
   4_000; dust 249 → 249 / 0; boundary 250 → 249 / 1.*
13. **I13 — treasury cannot be redirected or drained.** `treasury.key ==
   TREASURY_WALLET` enforced by address constraint (`Unauthorized`);
   `treasury_ata` additionally bound by ATA derivation (mint, owner), so an
   impostor ATA fails before any CPI. The treasury is never a payer —
   `treasury_ata` rent comes from the merchant via `init_if_needed`.
   *Test: impostor treasury key → reject; impostor treasury ATA → reject
   with subscriber/merchant balances untouched.*
14. **I14 — allowance ≥ amount still suffices, unchanged.** Because the legs
   sum to `amount`, the pre-existing `delegated_amount >= plan.amount` gate
   covers the split exactly: no second approval, no allowance bump, no new
   subscriber trust. Standing MAX allowances stay capped per-tx by I5+I12.
   *Test: approve exactly `amount` → charge succeeds; debit == `amount`.*

## 3. Attacks + mitigations

| # | Attack | How | Mitigation | Fails safe to |
|---|---|---|---|---|
| A1 | Over-charge per tx | merchant patches program/client to request `amount+k` | amount is read from on-chain `plan`, not tx args; `charge()` takes no amount parameter at all | Token program would still cap at allowance, but primary defense is no-amount-arg design |
| A2 | Rapid re-charge | merchant/keeper spams `charge()` in one slot | `last_paid_at = now` written before return; `TooEarly` gate with `period > 0` invariant; same-slot retry sees fresh timestamp | second tx fails, allowance intact |
| A3 | Charge after cancel | keeper tx in flight while user cancels | `status` check precedes CPI; cancelling first wins; in-flight charge lands before cancel → exactly one last legit debit, then Cancelled | either 0 or 1 debits, never more |
| A4 | Fake plan/merchant | attacker crafts accounts mimicking plan to route funds to own ATA | PDA seed checks (`b"plan"`, `b"sub"` + bump), `has_one`/key-equality on merchant, mint constraints; `merchant_ata.owner == plan.merchant` | tx fails on seed/owner constraint |
| A5 | Wrong-mint / decimals confusion | merchant charges USDC-amount of a 9-decimal meme mint | `plan.mint` immutable; all three mint checks (I7) + `transfer_checked` decimals enforcement; UI shows mint + decimals at subscribe | Token-program error, no movement |
| A6 | Revoke race / lingering allowance | user cancels on-chain but attacker charged earlier same slot; or user used standing MAX allowance and never verified revoke | state-write-before-revoke in `cancel()`; documented MUST: verify `delegate == None` off-chain, wallet-side `revoke()` fallback; keeper cannot charge post-cancel (A3) | worst case = one in-flight period debit (agreed amount), never unbounded |
| A7 | Grief via allowance removal | subscriber revokes/empties ATA to dodge payment | not an attack on funds — `charge()` simply fails (Token-program error); merchant observes missed payment off-chain and stops service; no program state corrupted | failed tx, sub stays Active until subscriber cancels |
| A8 | PDA confusion (`plan`/`sub` seed games) | attacker passes plan-PDA as subscription or vice versa | distinct seed prefixes (`b"plan"` vs `b"sub"`), distinct account types/owners, `PlanMismatch` check | Anchor account-owner/deserialization error |
| A9 | `period = 0` / overflow drain | infinite charges per slot; `last_paid_at + period` wraps past `now` | `create_plan` rejects `period <= 0`; `checked_add` → `Overflow` fail-closed | plan uncreatable / charge blocked |
| A10 | CPI injection (fake token program) | attacker passes malicious program as `token_program` | Anchor `program::token` address constraint (token-program ID check); never take the program ID from user input | invalid-program-ID error |
| A11 | ATA substitution | attacker swaps merchant_ata for own ATA owned by merchant? or subscriber_ata for victim's | `merchant_ata.owner == plan.merchant` + `subscriber_ata.owner == subscription.subscriber` + both `mint == plan.mint`; attacker-owned ATA fails owner check | constraint error |
| A12 | Frozen ATA DoS | subscriber's ATA frozen (Token-2022 freeze authority) bricks charge | charge fails cleanly (Token-program freeze error), no state change; merchant treats as missed payment (A7 path) | failed tx, retryable |
| A13 | Clock manipulation | validator timestamp jitter back-dates `now` to re-arm a charge early | jitter bounded (~seconds); each charge still advances `last_paid_at` to observed `now`, so gain ≤ jitter per period, never a full extra period; no slot logic | at most one slightly-early debit per period |
| A14 | Front-run subscribe (plan swap) | merchant changes plan terms between quote and subscribe | terms live on-chain in Plan PDA; wallet/RPC must display resolved PDA + terms pre-sign; `subscribe()` binds `subscription.plan` immutably at creation | user sees wrong terms and aborts (UX defense) |
| A15 | Keeper-key compromise | stolen merchant key charges every period + griefs via timing | blast radius = that merchant's plans' per-period amounts (no vault to empty); rotate merchant key = migrate to new plan (keys immutable per plan); recommend dedicated low-balance charge key, monitoring on `Charged` events | loss capped at `amount` × periods until subscribers cancel+revoke |
| A16 | Fee diversion (rogue treasury ATA) | merchant/keeper passes own ATA as `treasury_ata` to skim the 40 bps | `treasury` key pinned to `TREASURY_WALLET` by address constraint + ATA derivation binds (mint, owner); impostor fails at account validation, before any CPI (I13) | tx fails, balances untouched |
| A17 | Fee inflation / dust gaming | merchant tweaks client to charge a bigger fee, or splits plans to dodge it | fee is computed on-chain from `plan.amount` — `charge()` takes no amount or fee parameter (same no-arg design as A1); dust (< 25 base units) paying zero fee is accepted policy, not a hole (DESIGN.md §11.1) | fee always exactly `floor(amount·40/10000)` |

Out of scope (acknowledged, not mitigated on-chain): wallet UI spoofing the
`approve()` target, RPC lying about plan terms, Token-2022 transfer-fee
economics, merchant failing to deliver off-chain service after payment.

## 4. Keeper / bot notes for `charge()`

- **Key.** Keeper needs the **merchant** key (I3). Prefer a dedicated charge
  keypair used as `plan.merchant` from `create_plan` time; never the
  merchant's treasury cold key. Compromise cost is then bounded (A15).
- **Schedule.** Poll per subscription: `due = last_paid_at + period`;
  fire when `now >= due + ε` (ε ~ 30–60 s to absorb Clock jitter, A13).
  No on-chain cron — missed periods are simply skipped (one `amount` per
  successful call, no catch-up; see DESIGN.md §8).
- **Pre-flight (save fees).** Simulate/read before sending: status Active?
  `now >= due`? `subscriber_ata.delegate == sub-PDA` with
  `delegated_amount >= amount`? balance ≥ amount? Skip and retry next tick if
  any check fails (covers A7/A12 without burning fees).
- **Failure taxonomy.** `TooEarly` → bug in scheduler, back off a period.
  `SubscriptionCancelled` → drop the subscription from the rota permanently.
  Token-program errors (allowance/balance/frozen) → keep in rota, retry next
  period; alert merchant after N consecutive misses (subscriber may have
  silently revoked = de-facto cancel).
- **No batching tricks.** One `charge()` per subscription per tx (or a
  sequential multi-ix tx, each ix independent). Same-slot duplicates are
  harmless (A2) but waste fees — stagger.
- **Monitoring.** Index `Charged` / `Cancelled` events; alert on:
  `Charged` with unexpected amount (should equal `plan.amount` — I5),
  repeated Token-program failures, `delegate == None` while Active
  (subscriber revoked without cancelling → treat as churn).
- **Fee accounting.** `Charged` / `InvoiceCharged` now carry `fee`
  (I12): assert `merchant_delta + fee == plan.amount` per charge and sum
  `fee` across batches for treasury inflow. Never re-derive the fee from
  balance deltas off-chain — dust rounding is authoritative on-chain.
