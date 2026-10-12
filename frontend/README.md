# Frontend — Subscriptions dApp

Astro 5 + Svelte 5 islands + Tailwind v4, deploy jako **standalone Node**
przez `@astrojs/node` (Docker Compose). Pakiet manager: **Bun**. Ścisły TypeScript
(`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`).

## Struktura

| Ścieżka | Rola |
|---|---|
| `src/pages/` | `/` (marketplace planów), `/merchant` (formularz planu), `/manage` (moje subskrypcje), `/blink` (laboratorium Blinków) |
| `src/pages/api/[...path].ts` | uniwersalny proxy `/api/*` → backend (`BACKEND_URL`, domyślnie `http://backend:3001`) — metoda+query+body 1:1, bez logiki biznesowej |
| `src/components/` | wyspy Svelte: `PlansGrid`, `ManagePanel`, `MerchantForm`, `BlinkBuilder` + prezentacyjne `PlanCard`, `SubscriptionCard`, `Countdown`, `WalletButton`, `Toasts`, `Stat` |
| `src/lib/chain.ts` | odczyt on-chain bez IDL (ręczny decode kont 97/82 B, discriminatory przez `crypto.subtle`) |
| `src/lib/wallet.ts` | portfel Phantom-first/Solflare + round-trip `POST → sign → send → confirm` |
| `src/lib/blinks.ts` | budowa URL-i `solana-action:` i `dial.to` |
| `public/actions.json` | mapowanie Blinków (`/api/actions/**` → łańcuch) |

## Konfiguracja

```sh
cp .env.example .env
# PUBLIC_SUBSCRIPTIONS_PROGRAM_ID — podmień po `anchor deploy`
# PUBLIC_SOLANA_RPC / PUBLIC_SOLANA_CLUSTER — domyślnie devnet
# PUBLIC_SITE_URL — canonical origin (do URL-i Blinków)
```

Backend adresowany jest przez `BACKEND_URL` (tylko server-side, `process.env`,
NIGDY `import.meta.env`); lokalnie `http://localhost:3001`, w Compose `http://backend:3001`.

## Komendy (bun)

```sh
bun install
bun run dev        # http://localhost:4321
bun run check      # astro check (Svelte + TS)
bun run build      # build standalone Node (dist/server/entry.mjs)
bun run preview    # podgląd buildu (http://localhost:4321)
```

## Uwagi

- Akcje `subscribe`/`cancel` budują **atomowe** transakcje (approve+subscribe,
  revoke+cancel) — serwer nigdy nie podpisuje, płaci i podpisuje portfel.
- Kolejność kont `subscribeIx`/`cancelIx`/`chargeIx` zweryfikowana z IDL
  (`subscriptions/target/idl/subscriptions.json`, program `2jK5…vJuw`) +
  symulacją na devnecie 08.10 (bez podpisu, bez zmian stanu).
- Strona główna próbuje policzyć plany już w SSR; wyspy i tak ładują dane
  po stronie klienta, więc chwilowy błąd RPC nie kładzie strony.
