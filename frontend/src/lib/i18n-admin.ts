import { registerDict, type Dict } from "./i18n.js";

// ---------------------------------------------------------------------------
// Admin-slice dictionary (DemoAdmin): admin panel + global demo banner.
// `admin.*` / `demo.*` only — zero overlap with sibling dicts by contract.
// ---------------------------------------------------------------------------

const en: Dict = {
  "admin.panel": "Admin panel",
  "admin.mode": "Mode",
  "admin.modeAria": "Demo or live mode",
  "admin.demo": "Demo",
  "admin.live": "Live",
  "admin.copyLink": "Copy demo link",
  "admin.copied": "Copied",
  "admin.statusDemo": "Demo — fixtures from demo.ts, nothing is on-chain.",
  "admin.statusLive": "Live — only real on-chain data; missing values show as –.",
  "admin.replaces": "Demo replaces",
  "admin.replacesStats": "Stats — volume, plans, merchants (DEMO_STATS)",
  "admin.replacesPlans": "Plans — 3 fixture plans (DEMO_PLANS)",
  "admin.replacesReceipts": "Receipts — fixture invoices (DEMO_RECEIPTS)",
  "demo.banner": "DEMO — fixture data, not on-chain.",
  "demo.exit": "Exit demo",
};

const pl: Dict = {
  "admin.panel": "Panel admina",
  "admin.mode": "Tryb",
  "admin.modeAria": "Tryb demo lub na żywo",
  "admin.demo": "Demo",
  "admin.live": "Na żywo",
  "admin.copyLink": "Kopiuj link demo",
  "admin.copied": "Skopiowano",
  "admin.statusDemo": "Demo — dane przykładowe z demo.ts, nic nie jest on-chain.",
  "admin.statusLive": "Na żywo — tylko prawdziwe dane on-chain; braki pokazane jako –.",
  "admin.replaces": "Demo podmienia",
  "admin.replacesStats": "Statystyki — wolumen, plany, sprzedawcy (DEMO_STATS)",
  "admin.replacesPlans": "Plany — 3 przykładowe plany (DEMO_PLANS)",
  "admin.replacesReceipts": "Paragony — przykładowe faktury (DEMO_RECEIPTS)",
  "demo.banner": "DEMO — dane przykładowe, nie z chaina.",
  "demo.exit": "Wyjdź z demo",
};

registerDict(en, pl);
