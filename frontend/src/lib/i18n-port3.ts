import { registerDict, type Dict } from "./i18n.js";

// ---------------------------------------------------------------------------
// Manage-slice Stitch port dictionary (PortManage): status-bar telemetry,
// custody explainer, per-mint limits panel and Stitch receipt columns.
// Static Astro markup carries EN inline + data-i18n="port3.*"; reactive
// Svelte strings use $t(key). Zero key overlap with other slices.
// ---------------------------------------------------------------------------

const en: Dict = {
  // --- Status-bar telemetry strip ------------------------------------------
  "port3.programs": "active subscriptions",
  "port3.total": "total",
  "port3.live": "live",
  "port3.allowanceState": "SPL delegate allowance",
  "port3.allowanceCapped": "Limited (max cap)",
  "port3.allowanceNone": "none on-chain",

  // --- Custody explainer (sidebar) ------------------------------------------
  "port3.custodyTitle": "Model B: SPL delegations",
  "port3.custodyArch": "100% non-custodial architecture",
  "port3.custodyBody":
    "Your tokens never leave your wallet before the billing slot arrives. The program only holds a capped delegation.",
  "port3.custodyP1": "Revoke consent in one click, no provider questions.",
  "port3.custodyP2":
    "A charge before its slot fails the program's clock check (now ≥ last_paid_at + period); the token program separately rejects anything above the delegate cap.",
  "port3.custodyP3":
    "Every paid invoice leaves a 32-byte memo_hash in the invoice account — a receipt an auditor can replay from the ledger.",

  // --- Per-mint limits panel (aggregated from the cards, no extra reads) ----
  "port3.limitsTitle": "Active SPL delegation caps",
  "port3.limitsLead": "Summed from the cards on this page — no extra reads.",
  "port3.limitsEmpty": "No active allowances yet — subscribe to a plan on the homepage and the cap appears here.",
  "port3.perPeriod": "per period",
  "port3.allowedNow": "allowed now",

  // --- Receipt table (Stitch columns) ----------------------------------------
  "port3.colId": "receipt ID",
  "port3.colDateSlot": "date & slot",
  "port3.colExplorer": "explorer",
  "port3.seenBy": "seen by",
  "port3.explorerLink": "Explorer",
};

const pl: Dict = {
  "port3.programs": "aktywne subskrypcje",
  "port3.total": "razem",
  "port3.live": "na żywo",
  "port3.allowanceState": "limit delegacji SPL",
  "port3.allowanceCapped": "Limitowany (maks. cap)",
  "port3.allowanceNone": "brak on-chain",

  "port3.custodyTitle": "Model B: Delegacje SPL",
  "port3.custodyArch": "architektura w 100% niepowiernicza",
  "port3.custodyBody":
    "Twoje tokeny nigdy nie opuszczają portfela przed nadejściem slotu rozliczenia. Program trzyma tylko limitowaną delegację.",
  "port3.custodyP1": "Cofnij zgodę jednym klikiem, bez pytań.",
  "port3.custodyP2":
    "Pobranie przed slotem oblewa sprawdzenie zegara w programie (now ≥ last_paid_at + period); token program niezależnie odrzuca kwoty powyżej limitu delegacji.",
  "port3.custodyP3":
    "Każda zapłacona faktura zostawia 32-bajtowy memo_hash w koncie faktury — paragon, który audytor odtworzy z księgi łańcucha.",

  "port3.limitsTitle": "Aktywne limity delegacji SPL",
  "port3.limitsLead": "Zsumowane z kart na tej stronie — bez dodatkowych odczytów.",
  "port3.limitsEmpty": "Nie masz jeszcze aktywnych limitów — subskrybuj plan na stronie głównej, a limit pojawi się tutaj.",
  "port3.perPeriod": "na okres",
  "port3.allowedNow": "przyznane teraz",

  "port3.colId": "ID paragonu",
  "port3.colDateSlot": "data i slot",
  "port3.colExplorer": "eksplorator",
  "port3.seenBy": "widziany przez",
  "port3.explorerLink": "Eksplorator",
};

registerDict(en, pl);
