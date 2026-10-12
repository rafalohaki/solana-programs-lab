import { registerDict, type Dict } from "./i18n.js";

// ---------------------------------------------------------------------------
// Flows2-slice dictionary (FlowsPort): leaf-string labels for /blink,
// /examples and /pay that no sibling dict covers, plus the /blink live-vs-mock
// legend. Static Astro markup carries EN inline + data-i18n="flows2.*"; the
// Svelte builder uses the same keys via $t("flows2.*") — no overlap with
// blink.*/blinkb.*/blinkx.*/payex.*/paysim.*/port4.*.
// ---------------------------------------------------------------------------

const en: Dict = {
  // ---- /blink headline (gradient value span stays separate for bg-clip-text) ----
  "flows2.blinkH1a": "Blinks — pay from",
  "flows2.blinkH1b": "X / Discord",

  // ---- /blink header spec badge (replaces the old gateway-compat label) ----
  "flows2.specBadge": "// SPEC: SOLANA ACTIONS",

  // ---- /blink builder step 3 ----
  "flows2.step3t": "3. Ready link & export",
  "flows2.actionUrlLabel": "solana-action URL",
  "flows2.openJson": "Open endpoint JSON",
  "flows2.jsonShort": "endpoint JSON ↗",
  "flows2.securedBy": "Secured by the Actions spec",
  "flows2.copied": "Copied.",

  // ---- /blink X-feed preview card (static post frame, live card inside) ----
  "flows2.feedTime": "pinned · native in Phantom & Solflare",
  "flows2.feedBody":
    "Subscribe in one click from this post — no site visit. The wallet signs the same one-period-capped transaction as the popup.",
  "flows2.feedNotReady": "Fill the builder form — the link enables once the endpoint is complete.",
  "flows2.feedIdleHint":
    "Fills from the live GET metadata — click Preview action (GET) in the builder.",
  "flows2.templateNote":
    "Template URL — add ?demo=1 for a fixture link, or use the builder above for a live one.",

  // ---- /blink live-vs-mock legend ----
  "flows2.legendTitle": "What is live vs mocked on this page",
  "flows2.legendLive":
    "Live: the builder endpoint, the GET metadata preview, the copy buttons, and the endpoint JSON link — all run against this deployment.",
  "flows2.legendMock":
    "Mock: the X post frame around the card (avatar, post text) is a static prop. The card itself renders live GET metadata from this deployment, and its buttons only copy the solana-action: URL and open the endpoint JSON — no signature is ever simulated.",

  // ---- /examples hero stat badges (labels; values reuse payex.badge*) ----
  "flows2.badgeCustodyLabel": "Custody model",
  "flows2.badgeTxLabel": "Throughput",
  "flows2.demoChip": "DEMO — fixtures, no fetch",

  // ---- /examples case-study cards (static marketing mechanics, no chain data) ----
  "flows2.case1tag": "CASE 01 // SAAS",
  "flows2.case1t": "Solana Dedicated RPC",
  "flows2.case1b":
    "Monthly cluster subscriptions with elastic auto-tiering. No customer capital lock-up.",
  "flows2.case1billV": "250 USDC / mo",
  "flows2.case1trigV": "usage-based auto-tier",
  "flows2.case2tag": "CASE 02 // AI AGENTS",
  "flows2.case2t": "Autonomous agent plane",
  "flows2.case2b":
    "AI-to-AI subscriptions: the agent renews its own compute cluster against a hard delegation cap.",
  "flows2.case2billV": "100 SOL / epoch",
  "flows2.case2trigV": "cross-program invocation",
  "flows2.case3tag": "CASE 03 // COMMUNITY",
  "flows2.case3t": "Alpha Telegram & VIP",
  "flows2.case3b":
    "Token-gated bot verifies the subscription delegate; access revokes the moment the authorization lapses.",
  "flows2.case3billV": "0.75 SOL / 30d",
  "flows2.case3trigV": "revoke on lapse",
  "flows2.case4tag": "CASE 04 // MEDIA",
  "flows2.case4t": "Web3 deep-dive letter",
  "flows2.case4b":
    "Weekly on-chain micropayments. Readers pay only for reports actually published — no cards.",
  "flows2.case4billV": "5 USDC / issue",
  "flows2.case4trigV": "per publication",
  "flows2.paramBilling": "BILLING",
  "flows2.paramTrigger": "TRIGGER",

  // ---- /examples live widget card ----
  "flows2.payerStep": "1. Payer checkout",
  "flows2.noPlan": "Add ?plan=<address> to run the live popup checkout.",
  "flows2.exampleChip": "EXAMPLE",
  "flows2.planNotFound": "Plan account not found on-chain — numbers stay hidden until it exists.",
  "flows2.authzRow": "Authorization limit",
  "flows2.authzVal": "1 period (approve-capped)",
  "flows2.custodyRow": "Custody",
  "flows2.custodyVal": "none — Model B",
  "flows2.noDepositHint": "No deposit. Funds stay in your wallet until charge day.",
  "flows2.hintEmbedA": "Embed it anywhere: ",
  "flows2.hintEmbedB": ", paste the snippet, done — foreign domains get 403.",

  // ---- /examples observer console chrome ----
  "flows2.sigState": "INTERNAL SIGNATURE STATE",
  "flows2.sigIdle": "IDLE // AWAITING USER ACTION",
  "flows2.instr1": "INSTR 1",
  "flows2.instr2": "INSTR 2",
  "flows2.delegLabel": "DELEGATION",
  "flows2.delegHint":
    "spl_token delegate — per subscriber wallet; reading it needs a connected wallet.",
  "flows2.installLabel": "INSTALLATION",
  "flows2.installVal": "POST /api/widget/sites → paste snippet",
  "flows2.legendLabel": "Live vs mocked:",

  // ---- /pay checkout CTAs (labels only; pay-checkout.ts owns status text) ----
  "flows2.connectCta": "Connect wallet",
  "flows2.subscribeCta": "Subscribe",
  "flows2.demoDisabled": "Subscribe (disabled in demo — no transaction is built)",

  // ---- /pay phishing-403 mock preview copy ----
  "flows2.blockHeadline": "This site is not allowed to sell this plan",
  "flows2.blockBody":
    "Domain-bind: the merchant registered this plan for their own domain only. A copied snippet on a foreign domain always ends here (403).",

  // ---- /pay outage-502 mock preview copy ----
  "flows2.outageKicker": "HTTP 502 · MOCK",
  "flows2.outageTitle": "Checkout unavailable — API outage",

  // ---- BlinkBuilder kind cards (descriptions + mono signatures) ----
  "flows2.kindSubDesc": "Recurring pull against the plan — approve capped at one period",
  "flows2.kindCancelDesc": "Revoke the token delegate — access ends",
  "flows2.kindChargeDesc": "Merchant pulls one due period",
  "flows2.kindPlanDesc": "Create a new on-chain plan",
  "flows2.kindSubSign": "plan · mint · amount",
  "flows2.kindCancelSign": "plan · mint",
  "flows2.kindChargeSign": "plan · subscriber · merchant",
  "flows2.kindPlanSign": "merchant · planId · period",

  // ---- BlinkBuilder field labels (Svelte $t) ----
  "flows2.planPda": "Plan PDA",
  // Hover explanation for the "Plan PDA" label — the concept is opaque to a
  // first-time user (same copy is requested for MerchantForm labels).
  "flows2.planPdaHint":
    "Program Derived Address — an account address derived from seeds ([plan, merchant, plan_id]); no private key, the program signs via CPI.",
  // Editors' requested alias of planPdaHint above (same copy). planPdaHint is
  // the wired key (BlinkBuilder) — consolidate to one when convenient.
  "flows2.planPdaTitle":
    "Program Derived Address — an account address derived from seeds ([plan, merchant, plan_id]); no private key, the program signs via CPI.",
  "flows2.mintLabel": "Mint",
  "flows2.subscriberLabel": "Subscriber",
  "flows2.merchantLabel": "Merchant",

  // ---- BlinkBuilder create-plan field + preview rate value (static markup,
  // data-i18n; consumers: BlinkBuilder.svelte) ----
  "flows2.planIdLabel": "Plan ID",
  "flows2.ratePerTx": "1 period / tx",
};

const pl: Dict = {
  "flows2.blinkH1a": "Blinki — płać z",
  "flows2.blinkH1b": "X / Discorda",

  "flows2.specBadge": "// SPEC: ZGODNE Z ACTIONS",

  "flows2.step3t": "3. Gotowy link i eksport",
  "flows2.actionUrlLabel": "URL solana-action:",
  "flows2.openJson": "Otwórz endpoint JSON",
  "flows2.jsonShort": "endpoint JSON ↗",
  "flows2.securedBy": "Zabezpieczone specyfikacją Actions",
  "flows2.copied": "Skopiowano.",

  "flows2.feedTime": "przypięty · natywnie w Phantom i Solflare",
  "flows2.feedBody":
    "Zasubskrybuj jednym kliknięciem z tego posta — bez wchodzenia na stronę. Portfel podpisuje tę samą transakcję co popup, limitowaną do jednego okresu.",
  "flows2.feedNotReady":
    "Uzupełnij formularz buildera — link włączy się, gdy endpoint będzie kompletny.",
  "flows2.feedIdleHint":
    "Wypełni się z żywego GET metadata — kliknij „Podgląd akcji (GET)” w builderze.",
  "flows2.templateNote":
    "URL-szablon — dodaj ?demo=1 dla linku z fixturą albo użyj buildera wyżej, by uzyskać live URL.",

  "flows2.legendTitle": "Co na tej stronie jest live, a co mockiem",
  "flows2.legendLive":
    "Live: endpoint buildera, podgląd metadanych GET, przyciski kopiowania i link do endpointu JSON — wszystko działa na tym wdrożeniu.",
  "flows2.legendMock":
    "Mock: rama posta X wokół karty (awatar, treść wpisu) jest statyczną dekoracją. Sama karta renduje żywe metadane GET z tego wdrożenia, a jej przyciski tylko kopiują URL solana-action: i otwierają endpoint JSON — żaden podpis nie jest symulowany.",

  "flows2.badgeCustodyLabel": "Model depozytu",
  "flows2.badgeTxLabel": "Przepustowość",
  "flows2.demoChip": "DEMO — fixtury, bez fetch",

  "flows2.case1tag": "CASE 01 // SAAS",
  "flows2.case1t": "Dedykowany RPC Solana",
  "flows2.case1b":
    "Miesięczne subskrypcje klastrów z elastycznym auto-tieringiem. Bez blokady kapitału klienta.",
  "flows2.case1billV": "250 USDC / mies.",
  "flows2.case1trigV": "auto-tier wg użycia",
  "flows2.case2tag": "CASE 02 // AGENTY AI",
  "flows2.case2t": "Płaszczyzna agentów autonomicznych",
  "flows2.case2b":
    "Subskrypcje AI-do-AI: agent odnawia własny kluster compute względem sztywnego limitu delegacji.",
  "flows2.case2billV": "100 SOL / epokę",
  "flows2.case2trigV": "wywołanie cross-program",
  "flows2.case3tag": "CASE 03 // SPOŁECZNOŚĆ",
  "flows2.case3t": "Alpha Telegram i VIP",
  "flows2.case3b":
    "Bot z token-gate weryfikuje delegację subskrypcji; dostęp znika w chwili wygaśnięcia autoryzacji.",
  "flows2.case3billV": "0,75 SOL / 30 d",
  "flows2.case3trigV": "revoke po wygaśnięciu",
  "flows2.case4tag": "CASE 04 // MEDIA",
  "flows2.case4t": "Web3 deep-dive newsletter",
  "flows2.case4b":
    "Cotygodniowe mikropłatności on-chain. Czytelnicy płacą tylko za opublikowane raporty — bez kart.",
  "flows2.case4billV": "5 USDC / wydanie",
  "flows2.case4trigV": "za publikację",
  "flows2.paramBilling": "ROZLICZENIE",
  "flows2.paramTrigger": "WYZWALACZ",

  "flows2.payerStep": "1. Płatność (payer checkout)",
  "flows2.noPlan": "Dodaj ?plan=<adres>, aby uruchomić live popup checkout.",
  "flows2.exampleChip": "PRZYKŁAD",
  "flows2.planNotFound": "Konta planu brak on-chain — liczby pojawią się, gdy powstanie.",
  "flows2.authzRow": "Limit autoryzacji",
  "flows2.authzVal": "1 okres (limit approve)",
  "flows2.custodyRow": "Depozyt",
  "flows2.custodyVal": "brak — Model B",
  "flows2.noDepositHint": "Bez depozytu. Środki zostają w portfelu do dnia płatności.",
  "flows2.hintEmbedA": "Osadź gdziekolwiek: ",
  "flows2.hintEmbedB": ", wklej snippet, gotowe — obce domeny dostają 403.",

  "flows2.sigState": "WEWNĘTRZNY STAN PODPISU",
  "flows2.sigIdle": "IDLE // OCZEKIWANIE NA AKCJĘ",
  "flows2.instr1": "INSTRUKCJA 1",
  "flows2.instr2": "INSTRUKCJA 2",
  "flows2.delegLabel": "DELEGACJA",
  "flows2.delegHint":
    "delegat spl_token — per portfel subskrybenta; odczyt wymaga podłączonego portfela.",
  "flows2.installLabel": "INSTALACJA",
  "flows2.installVal": "POST /api/widget/sites → wklej snippet",
  "flows2.legendLabel": "Live vs mock:",

  "flows2.connectCta": "Podłącz portfel",
  "flows2.subscribeCta": "Subskrybuj",
  "flows2.demoDisabled": "Subskrybuj (wyłączone w demo — transakcja nie jest budowana)",

  "flows2.blockHeadline": "Ta strona nie może sprzedawać tego planu",
  "flows2.blockBody":
    "Domain-bind: merchant zarejestrował ten plan tylko dla własnej domeny. Skopiowany snippet na obcej domenie zawsze kończy tutaj (403).",

  "flows2.outageKicker": "HTTP 502 · MOCK",
  "flows2.outageTitle": "Checkout niedostępny — awaria API",

  "flows2.kindSubDesc": "Cykliczny pobór z planu — approve limitowany do jednego okresu",
  "flows2.kindCancelDesc": "Cofa delegację tokenową — dostęp wygasa",
  "flows2.kindChargeDesc": "Merchant pobiera jeden zaległy okres",
  "flows2.kindPlanDesc": "Tworzy nowy plan on-chain",
  "flows2.kindSubSign": "plan · mint · kwota",
  "flows2.kindCancelSign": "plan · mint",
  "flows2.kindChargeSign": "plan · subskrybent · merchant",
  "flows2.kindPlanSign": "merchant · planId · okres",

  "flows2.planPda": "Plan PDA",
  "flows2.planPdaHint":
    "Program Derived Address — adres konta wywodzony z nasion ([plan, merchant, plan_id]); bez klucza prywatnego — program podpisuje przez CPI.",
  "flows2.planPdaTitle":
    "Program Derived Address — adres konta wyliczony z nasion ([plan, merchant, plan_id]); bez klucza prywatnego: program podpisuje przez CPI.",
  "flows2.mintLabel": "Mint",
  "flows2.subscriberLabel": "Subskrybent",
  "flows2.merchantLabel": "Merchant",

  "flows2.planIdLabel": "Identyfikator planu",
  "flows2.ratePerTx": "1 okres / tx",
};

registerDict(en, pl);
