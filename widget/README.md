# solhack widget — Stripe-style popup checkout
Snippet: `<script src="https://solhack.rafal.si/widget.js"></script>` + `SolhackPay.subscribe({plan})` opens `/pay` in a popup resolving with the tx signature.
Bind: domain-bind is enforced server-side on `/pay` (backend `GET /api/widget/check`); copying the snippet to a foreign domain ends in 403.
Deploy: this file is static — after any edit, hand-copy `widget/src/widget.js` → `frontend/public/widget.js` (no bundler, keep both byte-identical).
Register: merchant binds a domain via `POST /api/widget/sites` — the request must carry the merchant's ed25519 signature over the canonical bind message (see below) plus a fresh timestamp; on top of that the plan ownership is still RPC-verified (`plan.merchant` must match). Test locally with `/demo-shop?plan=<PLAN>` on devnet. EmbedPanel in demo mode (`?demo=1`) skips the signature client-side (UI-only — such a call fails against a live backend).

## Domain binding — merchant signature
`POST /api/widget/sites` `{merchant, domain, plan, signature, timestamp}` requires an **ed25519 detached signature by the merchant keypair** over EXACTLY this UTF-8 string (backend `widgetBindMessage` in `backend/src/widget.ts`):

```
iugis widget-bind
merchant:<merchant>
domain:<domain>
plan:<plan>
ts:<timestamp>
```

- `domain` must be pre-normalized server-style (`normalizeHost`: trim, lowercase, port / IPv6 brackets stripped, trailing dot removed) — the client signs the same normalized string the backend stores.
- `timestamp` is ms epoch, accepted within **±10 minutes** of server time (replay window, `SIGNATURE_WINDOW_MS`).
- `signature` is base58 (Bitcoin alphabet) of the 64-byte ed25519 signature. The dApp flow: `signMessage()` in `frontend/src/lib/wallet.ts` asks the connected Phantom/Solflare wallet, EmbedPanel bs58-encodes the result; backend verifies with `tweetnacl.sign.detached.verify` + its own base58 decoder.
- Any malformed/expired/forged signature answers **401** with a generic message; the RPC `plan.merchant` ownership check then runs as the second layer (defense in depth).

Sign + send from a script (Bun/Node):

```ts
import bs58 from "bs58";
import nacl from "tweetnacl";

const timestamp = Date.now();
const message =
  `iugis widget-bind\nmerchant:${merchant}\ndomain:${domain}\nplan:${plan}\nts:${timestamp}`;
const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), secretKey));
// body: { merchant, domain, plan, timestamp, signature }
```

curl (signature value illustrative):

```bash
curl -X POST http://localhost:3001/api/widget/sites \
  -H 'content-type: application/json' \
  -d '{"merchant":"<MERCHANT_PUBKEY>","domain":"shop.example.com","plan":"<PLAN_PUBKEY>","timestamp":1728300000000,"signature":"<BASE58_ED25519_SIGNATURE>"}'
```
