# OnchainSUB — submission field outline

Facts you can verify yourself are in the "Check it" column. Fill the fields in **your own
words** — the outline is here so nothing is missed and no claim outruns its evidence, not so
you can paste it.

---

## 1. Project details

**Project name**
- `OnchainSUB` — matches the wordmark on the live site, the repo title, and the on-screen
  brand in both videos.

**One-line / short description**
- Anchor the sentence on the single mechanism, not the category: a Solana program for
  recurring payments where the subscriber signs one `subscribe()` and one off-chain
  `approve()`, and the merchant's `charge()` pulls exactly one period from a plan the
  program stores immutably on-chain.
- Lead with the anti-overcharge property: **`charge()` takes no amount argument** — the
  amount comes from the on-chain plan, so the merchant cannot charge more than the plan says.
  That is structural, not a policy promise.

**Category**
- `Payments & Remittance`.

**Chain / ecosystem**
- `Solana` — program `2jK5cy3PaCnD2cLfp3VCqxySBx4dyDhBc7GuutACvJuw`, live on **devnet**.

**What it does (the 3–4 sentence version)**
- Subscriber: approves the subscription PDA as an SPL-Token delegate, capped at exactly one
  period. Funds stay in the subscriber's wallet until charge day.
- Merchant: calls `charge()`, which CPIs `transfer_checked` signed by the subscription PDA.
- Fee: `FEE_BPS = 40` (0.4%), `floor(amount * 40 / 10000)`, to treasury
  `2p1sPBmViJjKhUM1aKCsd25nayKeXRJnpmJAwWFYbucP`.
- PDAs: plan `[b"plan", merchant, plan_id u64 LE]`, subscription `[b"sub", plan, subscriber]`,
  invoice `[b"invoice", subscription, invoice_id u64 LE]`.

**Why now / why Solana**
- Recurring payment on-chain normally needs either custody or a standing unlimited approval.
  The delegate-plus-immutable-plan combination gets one-period-capped pulls with zero custody.
  Solana's cheap fees and fast finality make a per-period on-chain charge economically sane.

**Links**
- Live: `https://solhack.rafal.si`
- Repo: `https://github.com/rafalohaki/solana-programs-lab` (public, MIT)

---

## 2. Media and code

**Demo video (~2:57)**
- `https://github.com/rafalohaki/solana-programs-lab/releases/download/submission-v1/onchain-sub-demo.mp4`
- Plays inline, verified in a real `<video>` element (readyState 4, 1920x1080, 176.98s).

**Pitch video (~1:48, voiced)**
- `https://github.com/rafalohaki/solana-programs-lab/releases/download/submission-v1/onchain-sub-pitch.mp4`
- 107.99s, voiced narration, verified playing inline.

**Logo / brand card**
- In the repo under `submission/`: `logo-1080.png` (1080x1080),
  `logo-wide-1600x900.png`, `brand-card-1920x1080.png` (+ `.jpg` variants).

**Code**
- Public repo above. `subscriptions/` = Anchor program; `backend/` = Bun + Hono API;
  `frontend/` = Astro + Svelte; `actions/` = Solana Actions/Blinks.

**Check it yourself** (all of these are live, so a judge can confirm them without trusting you)
- `https://solhack.rafal.si/api/stats/volume` and `/api/stats/fees` — the recorded demo
  charges. **Note the unit caveat below.**
- Program on devnet: append `?cluster=devnet` to any explorer URL or it will look empty.
- Recorded charge tx
  `36faTWSe9Bwkug7Xkcdaeaazo1SzTJJ1xcmJuyC8yBho3u3AWBdsiG7tVyE7HWdvP3rqD8nQanRfDrPNGDUV9pcS` —
  `err: null`, fee exactly 40 bps of the amount.
- The 8 pages: `/`, `/pay?demo=1`, `/merchant`, `/manage?demo=1`, `/blink`, `/examples?demo=1`.

---

## 3. Team

- **RAFALO** — solo builder, Kraków, Poland. Wrote the on-chain program, the backend, the
  frontend, and the Blinks integration.
- **X / socials: leave blank** (you decided this) — GitHub + live site are the contact surface.
- Contact email is already published on the site.

---

## 4. Final submission — honesty checklist

Say these plainly. They cost you nothing and they are the difference between a judge trusting
the numbers and discounting all of them:

- **Devnet only.** No mainnet deployment.
- **No real users, no customers, no revenue.** The 2 recorded charges are self-subscriptions —
  the subscriber PDA's owner equals the merchant equals the deploy keypair.
- **The "volume" figure is not dollars.** It is `200000` base units of a **self-minted devnet
  test mint** with 6 decimals, created by `createMint(...)` in the demo setup. The live site
  labels it **"Settled volume (test mint)"** for exactly this reason — match that wording.
- **Not audited.** Do not use with real funds.
- **Known gap, stated rather than hidden:** `actions/src/routes/pay.ts` implements a Solana Pay
  action but is not mounted in `backend/src/routes.ts`, so `/api/actions/pay` 404s. The other
  six action routes are live and correct. Say so if asked; do not claim the pay Blink works.
- The card-network figures shown in the pitch (~2.9% + $0.30, settle ~T+2) are **published
  industry figures**, labelled as such on screen — not measured OnchainSUB metrics.

---

## Optional talking points, only if you can back them up live

- **Structural anti-overcharge:** `charge()` has no amount parameter. Worth emphasizing
  because it is verifiable in the program source, not a claim about intent.
- **Zero custody:** funds never leave the subscriber's wallet until a charge executes, and the
  approval is capped at one period.
- Also shipped: Solana Actions/Blinks for plan creation, subscribe, cancel, charge, invoice,
  batch; Helius RPC + webhook; Pyth price feeds; Solana Pay; Ed25519 receipt binding;
  a merchant kill-switch at `/manage?demo=1`; a phishing/authorized-domain simulator at
  `/pay?demo=1`.
- Tests: 24 Anchor (solana-bankrun), 27 backend, 15 Playwright e2e. Run them yourself —
  the README has the commands.
