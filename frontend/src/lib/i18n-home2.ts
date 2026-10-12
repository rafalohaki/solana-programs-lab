import { registerDict, type Dict } from "./i18n.js";

// ---------------------------------------------------------------------------
// Home2-slice dictionary (Stitch density port): plan-grid polish, plan-card
// merchant line, agent teaser note, judge-FAQ footer tags and the
// integration code-window copy button. Static Astro markup carries EN inline
// + data-i18n="home2.*"; reactive Svelte strings use $t(key). Zero key
// overlap with i18n-static.ts / i18n-app.ts / i18n-proofs.ts / i18n-port1.ts.
// ---------------------------------------------------------------------------

const en: Dict = {
  // --- PlanCard merchant line (live shortAddr, never a .sol mock) -----------
  "home2.cardBy": "by",

  // --- PlanCard plan-address copy button (click = copyText + toast) ---------
  "home2.copyAddr": "Copy plan address",
  "home2.addrLabel": "Plan address",

  // --- AgentStrip teaser note (pill next to the eyebrow) --------------------
  "home2.agentNote": "3 mechanisms · 0 promises",

  // --- JudgeFaq footer tags (mono source rows, Stitch bento look) -----------
  "home2.jtag1": "model B · delegate",
  "home2.jtag2": "cancel + revoke",
  "home2.jtag3": "any SPL mint",
  "home2.jtag4": "env-configured",

  // --- Integration code window (real /api/actions/* endpoints) --------------
  "home2.codeFile": "actions.endpoints",
  "home2.copy": "Copy",
  "home2.copied": "Copied",
  "df.wallet": "Your wallet",
  "df.approve": "approve · cap = 1 period",
  "df.pda": "Subscription PDA",
  "df.charge": "charge · transfer_checked",
  "df.merchant": "Merchant",
  "df.custody": "zero custody · funds stay in your ATA",
  "df.caption": "live delegate flow · model b",

  // --- Wallet chip balance (Stitch D2 port) ---------------------------------
  "home2.balanceTitle": "Wallet SOL balance",

  // --- Plan metadata registry (Stitch D1 port, merchant-declared copy) ------
  "home2.planFallback": "Plan",
  "home2.meta.declaredTip": "Declared by the merchant — shown as written, not verified on-chain.",
  "home2.meta.kicker": "Plan metadata",
  "home2.meta.optional": "(optional — shown on the card)",
  "home2.meta.title": "Title",
  "home2.meta.titlePh": "e.g. Alpha Feed Pro",
  "home2.meta.desc": "Description",
  "home2.meta.descPh": "What does this plan include? Shown on the card exactly as you write it.",
  "home2.meta.category": "Category",
  "home2.meta.catNone": "None",
  "home2.meta.honesty":
    "Declared by you (the merchant) and shown on the plan card as-is — like a product description in Stripe, not verified on-chain.",
  "home2.meta.saving": "Saving metadata…",
  "home2.meta.saved": "Plan metadata saved",
  "home2.meta.fail": "Plan created, but metadata was not saved",
  "home2.catAll": "All categories",
  "home2.catGroupAria": "Filter plans by category",
  "home2.catSaas": "SaaS",
  "home2.catRpc": "RPC",
  "home2.catAi": "AI",
  "home2.catCommunity": "Community",
  "home2.catDevtools": "Dev tools",

  // --- SubscriptionModal (Stitch D3 port, honest data only) -----------------
  "submodal.title": "Confirm subscription",
  "submodal.close": "Close",
  "submodal.walletLabel": "Your wallet",
  "submodal.notConnected": "not connected",
  "submodal.pdaLabel": "Your subscription PDA",
  "submodal.youSign": "You sign (1 transaction)",
  "submodal.delegateTo": "delegate to",
  "submodal.creates": "creates",
  "submodal.cancelNote":
    "Cancel anytime — revoking the delegate stops every future charge. Your funds never leave your wallet: the program can only pull the agreed amount, once per period.",
  "submodal.cancel": "Cancel",
  "submodal.confirm": "Confirm and sign",

  // --- EmptyState art captions (SVG note under each art variant) -----------
  "ea.notePlans": "awaiting first plan",
  "ea.noteReceipts": "no charges yet",
  "ea.noteGeneric": "nothing here yet",
};

const pl: Dict = {
  "home2.cardBy": "od",
  "home2.copyAddr": "Kopiuj adres planu",
  "home2.addrLabel": "Adres planu",
  "home2.agentNote": "3 mechanizmy · 0 obietnic",
  "home2.jtag1": "model B · delegacja",
  "home2.jtag2": "cancel + revoke",
  "home2.jtag3": "dowolny mint SPL",
  "home2.jtag4": "konfiguracja przez env",
  "home2.codeFile": "actions.endpoints",
  "home2.copy": "Kopiuj",
  "home2.copied": "Skopiowano",
  "df.wallet": "Twój portfel",
  "df.approve": "approve · limit = 1 okres",
  "df.pda": "Subscription PDA",
  "df.charge": "charge · transfer_checked",
  "df.merchant": "Merchant",
  "df.custody": "zero custody · środki zostają w Twojej ATA",
  "df.caption": "żywy przepływ delegacji · model b",

  "home2.balanceTitle": "Saldo SOL portfela",

  // --- Plan metadata registry (Stitch D1 port, merchant-declared copy) ------
  "home2.planFallback": "Plan",
  "home2.meta.declaredTip": "Zadeklarowane przez merchanta — pokazane tak, jak zapisano, bez weryfikacji on-chain.",
  "home2.meta.kicker": "Metadane planu",
  "home2.meta.optional": "(opcjonalne — pokazywane na karcie)",
  "home2.meta.title": "Tytuł",
  "home2.meta.titlePh": "np. Alpha Feed Pro",
  "home2.meta.desc": "Opis",
  "home2.meta.descPh": "Co zawiera ten plan? Pokażemy to na karcie dokładnie tak, jak napiszesz.",
  "home2.meta.category": "Kategoria",
  "home2.meta.catNone": "Brak",
  "home2.meta.honesty":
    "Deklarowane przez Ciebie (merchanta) i pokazywane na karcie planu bez zmian — jak opis produktu w Stripe, bez weryfikacji on-chain.",
  "home2.meta.saving": "Zapisywanie metadanych…",
  "home2.meta.saved": "Metadane planu zapisane",
  "home2.meta.fail": "Plan utworzony, ale metadane nie zostały zapisane",
  "home2.catAll": "Wszystkie kategorie",
  "home2.catGroupAria": "Filtruj plany po kategorii",
  "home2.catSaas": "SaaS",
  "home2.catRpc": "RPC",
  "home2.catAi": "AI",
  "home2.catCommunity": "Społeczność",
  "home2.catDevtools": "Narzędzia dev",

  "submodal.title": "Potwierdź subskrypcję",
  "submodal.close": "Zamknij",
  "submodal.walletLabel": "Twój portfel",
  "submodal.notConnected": "brak połączenia",
  "submodal.pdaLabel": "Twój Subscription PDA",
  "submodal.youSign": "To podpisujesz (1 transakcja)",
  "submodal.delegateTo": "delegacja dla",
  "submodal.creates": "tworzy",
  "submodal.cancelNote":
    "Anuluj w każdej chwili — revoke delegacji zatrzymuje wszystkie przyszłe pobrania. Środki nigdy nie opuszczają Twojego portfela: program może pobrać wyłącznie uzgodnioną kwotę, raz na okres.",
  "submodal.cancel": "Anuluj",
  "submodal.confirm": "Potwierdź i podpisz",

  // --- EmptyState art captions ---
  "ea.notePlans": "oczekiwanie na pierwszy plan",
  "ea.noteReceipts": "jeszcze brak obciążeń",
  "ea.noteGeneric": "tu jeszcze nic nie ma",
};

registerDict(en, pl);
