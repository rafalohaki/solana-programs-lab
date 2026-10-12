import { registerDict, type Dict } from "./i18n.js";

// ---------------------------------------------------------------------------
// Merchant density pass (merch2 slice): stats bar, numbered module headers,
// subscriber preview card, invoice table, widget ownership row.
// Static markup carries EN inline + data-i18n*; reactive strings use $t(key).
// Zero key overlap with i18n-static.ts / i18n-app.ts / i18n-port2.ts by
// contract (m2.* only).
// ---------------------------------------------------------------------------

const en: Dict = {
  // --- Stats bar (merchant.astro; values are live client fetches) ----------
  "m2.stats.plans": "My plans",
  "m2.stats.plansHint": "fetchPlans · filtered by wallet",
  "m2.stats.invoices": "My invoices",
  "m2.stats.invoicesHint": "fetchInvoicesOfMerchant · count",
  "m2.stats.domains": "Domains",
  "m2.stats.domainsHint": "GET /api/widget/sites?merchant",
  "m2.stats.perPeriod": "Est. per period",
  "m2.stats.perPeriodHint": "sum of plan amounts × 1 period",
  "m2.stats.connect": "connect wallet",
  "m2.stats.loading": "loading…",
  "m2.stats.live": "live",
  "m2.stats.authority": "Merchant authority",
  "m2.stats.refresh": "Refresh stats",
  "m2.stats.note":
    "Live: counts come from RPC + the widget API once the wallet connects. Per-period is the raw sum of your plan amounts × 1 — not a forecast.",

  // --- Numbered module headers (merchant.astro) -----------------------------
  "m2.mod.kicker": "Module",
  "m2.mod.creator": "Plan creator",
  "m2.mod.creatorLead": "Set the mint, amount and billing period. The plan PDA is derived deterministically.",
  "m2.mod.tagCreate": "ATOMIC PROGRAM INSTRUCTION: create_plan",
  "m2.mod.batch": "Batch charging & invoicing",
  "m2.mod.batchLead": "Issue invoices against active subscriptions, then charge up to 8 per transaction.",
  "m2.mod.tagBatch": "ATOMIC PROGRAM INSTRUCTION: charge_invoice · batch (max 8)",
  "m2.mod.widget": "Widget generator & origin binding",
  "m2.mod.widgetLead": "Bind a domain to a plan and paste the snippet. Foreign origins end in 403.",
  "m2.mod.tagWidget": "OFF-CHAIN API: domain binding · Ed25519 wallet signature on save",

  // --- Subscriber preview card (MerchantForm; pure $derived, read-only) -----
  "m2.pv.kicker": "Subscriber preview",
  "m2.pv.live": "Live sync",
  "m2.pv.per": "per",
  "m2.pv.pda": "Plan PDA",
  // Editors' requested preview-card variant of the PDA tooltip; same copy as
  // m2.pdaTitle below (the currently wired key). Not referenced in markup yet.
  "m2.pv.pdaHint":
    "Program Derived Address — an account address derived from seeds ([plan, merchant, plan_id]); no private key, the program signs via CPI.",
  // Tooltip for the "Plan PDA" labels (MerchantForm preview + merchant.astro lead):
  // PDA is unexplained jargon for a fresh user — data-i18n-title carries this.
  "m2.pdaTitle":
    "Program Derived Address — an account address derived from seeds ([plan, merchant, plan_id]); no private key, the program signs via CPI.",
  "m2.pv.delegate": "SPL delegate limit",
  "m2.pv.delegateNote": "= amount × 1 period",
  "m2.pv.note": "Checkout preview from the subscriber's perspective. Read-only.",
  "m2.pv.noPda": "connect wallet for PDA",
  "m2.pv.planLabel": "Subscription",
  "m2.pv.view": "Preview — read-only",

  // --- Invoice table (InvoicesPanel) ----------------------------------------
  "m2.inv.selectAll": "Select all unpaid",
  "m2.inv.colSub": "Subscriber",
  "m2.inv.colPlan": "Plan · Invoice",
  "m2.inv.colLast": "Last",
  "m2.inv.colStatus": "Status",
  "m2.inv.colMemo": "Memo · Action",
  "m2.inv.showMemo": "Show memo",
  "m2.inv.hideMemo": "Hide memo",
  "m2.inv.memoHash": "memo hash (sha256, on-chain)",
  "m2.inv.demoSigTitle": "Demo receipt signature (fixtures carry no subscriber)",
  "m2.inv.report": "Open account in Explorer",
  "m2.inv.colAmount": "Amount",
  "m2.inv.selectOne": "Select invoice",
  "m2.inv.feeEst": "est. fee",
  "m2.inv.feeProtocol": "protocol fee 0.4%",
  "m2.inv.neverPaid": "not charged yet",
  "m2.inv.paid": "paid",
  "m2.inv.unpaid": "unpaid",
  "m2.inv.voided": "voided",
  "m2.inv.empty": "No invoices yet — pick a plan, load an active subscription above and issue the first invoice.",
  "m2.inv.demoNote": "Demo receipts — charging is disabled in demo mode.",

  // --- Widget ownership row (EmbedPanel) ------------------------------------
  "m2.emb.noPlans": "No plans — create a plan above",
  "m2.emb.msgTitle": "Widget-bind message (canonical, unsigned)",
  "m2.emb.msgNote": "Your wallet signs exactly this string when you save — with a fresh timestamp.",
  "m2.emb.blinks": "Blinks ready",
  "m2.emb.blinksBody": "Every plan is a Solana Action — /blink renders a shareable Blink for it.",
};

const pl: Dict = {
  "m2.stats.plans": "Moje plany",
  "m2.stats.plansHint": "fetchPlans · filtrowane po portfelu",
  "m2.stats.invoices": "Moje faktury",
  "m2.stats.invoicesHint": "fetchInvoicesOfMerchant · licznik",
  "m2.stats.domains": "Domeny",
  "m2.stats.domainsHint": "GET /api/widget/sites?merchant",
  "m2.stats.perPeriod": "Szac. na okres",
  "m2.stats.perPeriodHint": "suma kwot planów × 1 okres",
  "m2.stats.connect": "podłącz portfel",
  "m2.stats.loading": "ładowanie…",
  "m2.stats.live": "na żywo",
  "m2.stats.authority": "Autorytet merchanta",
  "m2.stats.refresh": "Odśwież statystyki",
  "m2.stats.note":
    "Na żywo: liczniki z RPC + widget API po podłączeniu portfela. Suma kwot Twoich planów × 1 — to nie prognoza.",

  "m2.mod.kicker": "Moduł",
  "m2.mod.creator": "Kreator planu",
  "m2.mod.creatorLead": "Ustaw mint, kwotę i okres rozliczeniowy. PDA planu wyliczane jest deterministycznie.",
  "m2.mod.tagCreate": "ATOMIC PROGRAM INSTRUCTION: create_plan",
  "m2.mod.batch": "Masowe pobieranie opłat i faktury",
  "m2.mod.batchLead": "Wystawiaj faktury do aktywnych subskrypcji i pobieraj do 8 na transakcję.",
  "m2.mod.tagBatch": "ATOMIC PROGRAM INSTRUCTION: charge_invoice · batch (max 8)",
  "m2.mod.widget": "Generator widgetu i wiązanie origin",
  "m2.mod.widgetLead": "Przypisz domenę do planu i wklej snippet. Obce originy kończą na 403.",
  "m2.mod.tagWidget": "OFF-CHAIN API: wiązanie domen · podpis Ed25519 portfela przy zapisie",

  "m2.pv.kicker": "Podgląd subskrybenta",
  "m2.pv.live": "Live sync",
  "m2.pv.per": "co",
  "m2.pv.pda": "PDA planu",
  "m2.pv.pdaHint":
    "Program Derived Address — adres konta wywodzony z nasion ([plan, merchant, plan_id]); bez klucza prywatnego — program podpisuje przez CPI.",
  "m2.pdaTitle":
    "Program Derived Address — adres konta wyliczony z nasion ([plan, merchant, plan_id]); bez klucza prywatnego: program podpisuje przez CPI.",
  "m2.pv.delegate": "Limit delegacji SPL",
  "m2.pv.delegateNote": "= kwota × 1 okres",
  "m2.pv.note": "Podgląd checkoutu z perspektywy klienta. Tylko odczyt.",
  "m2.pv.noPda": "podłącz portfel, aby zobaczyć PDA",
  "m2.pv.planLabel": "Subskrypcja",
  "m2.pv.view": "Podgląd — tylko odczyt",

  "m2.inv.selectAll": "Zaznacz wszystkie nieopłacone",
  "m2.inv.colSub": "Subskrybent",
  "m2.inv.colPlan": "Plan · Faktura",
  "m2.inv.colAmount": "Kwota",
  "m2.inv.selectOne": "Wybierz fakturę",
  "m2.inv.colLast": "Ostatnia",
  "m2.inv.colStatus": "Status",
  "m2.inv.colMemo": "Memo · Akcja",
  "m2.inv.showMemo": "Pokaż memo",
  "m2.inv.hideMemo": "Ukryj memo",
  "m2.inv.memoHash": "hash memo (sha256, on-chain)",
  "m2.inv.demoSigTitle": "Demonstracyjny podpis paragonu (fikstury nie mają subskrybenta)",
  "m2.inv.report": "Otwórz konto w Explorerze",
  "m2.inv.feeEst": "szac. fee",
  "m2.inv.feeProtocol": "opłata protokołu 0,4%",
  "m2.inv.neverPaid": "jeszcze nie pobrano",
  "m2.inv.paid": "opłacona",
  "m2.inv.unpaid": "nieopłacona",
  "m2.inv.voided": "unieważniona",
  "m2.inv.empty": "Brak faktur — wybierz plan powyżej, wczytaj aktywną subskrypcję i wystaw pierwszą fakturę.",
  "m2.inv.demoNote": "Paragony demo — pobieranie opłat jest wyłączone w trybie demo.",

  "m2.emb.noPlans": "Brak planów — utwórz plan powyżej",
  "m2.emb.msgTitle": "Wiadomość wiązania widgetu (kanoniczna, niepodpisana)",
  "m2.emb.msgNote": "Portfel podpisuje przy zapisie dokładnie ten ciąg — ze świeżym znacznikiem czasu.",
  "m2.emb.blinks": "Blinki gotowe",
  "m2.emb.blinksBody": "Każdy plan jest Solana Action — /blink generuje dla niego udostępnialny Blink.",
};

registerDict(en, pl);
