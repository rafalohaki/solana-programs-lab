import { registerDict, type Dict } from "./i18n.js";

// ---------------------------------------------------------------------------
// Manage-slice dictionary (Agent ManagePro): status bar, kill-switch,
// allowance rows and the device-local receipt history. Static Astro markup
// carries EN inline + data-i18n="manage2.* / receipt.*"; reactive Svelte
// strings use $t(key). Zero key overlap with other slices by contract.
// ---------------------------------------------------------------------------

const en: Dict = {
  // --- Status bar -----------------------------------------------------------
  "manage2.delegateActive": "Self-custodial delegate active",
  "manage2.delegateIdle": "No delegate allowance on-chain",
  "manage2.engine": "SPL-Token rule engine",
  "manage2.activeSubs": "active subscriptions",
  "manage2.nextCharge": "closest charge",
  "manage2.noCharges": "no upcoming charges",
  "manage2.programStatus": "program status",
  "manage2.anchorVerified": "Program: Anchor IDL verified",
  // Tooltip copy for the status tile in ManagePanel (data-i18n-title wiring).
  "manage2.anchorTitle":
    "Program matches the Anchor IDL published in /subscriptions/target/idl",
  "manage2.zeroCustody": "Zero-custody: funds stay in your wallet until each charge.",
  "manage2.ofWhich": "of which",

  // --- Kill-switch ----------------------------------------------------------
  "manage2.kill": "Emergency kill-switch",
  "manage2.killHint": "One transaction, revokes every allowance. No program involved.",
  "manage2.killArm": "Click again to revoke all allowances",
  "manage2.killWorking": "Revoking…",
  "manage2.killed": "All allowances revoked",
  "manage2.killFail": "Kill-switch failed",
  "manage2.killEmpty": "Nothing to revoke — no active allowances.",
  "manage2.killNoWallet": "Connect your wallet first.",

  // --- Allowance row (SubscriptionCard) -------------------------------------
  "manage2.allowance": "SPL delegated allowance",
  "manage2.allowanceLoading": "reading allowance…",
  "manage2.allowanceNone": "no allowance (revoked or never approved)",
  "manage2.allowanceNoAta": "no token account for this mint",
  "manage2.delegateTo": "delegate",
  "manage2.capNote": "cap = 1 period",

  // --- Receipt history (device-local) ---------------------------------------
  "receipt.title": "Charge history & on-chain receipts",
  "receipt.lead":
    "Every row below was saved in this browser when a charge confirmed here. This is not a global index.",
  "receipt.thisDevice": "This device",
  "receipt.deviceNote": "Saved in this browser's localStorage when a charge confirms here — switch device and the list is empty.",
  "receipt.empty": "No receipts on this device yet. Charge a subscription and the receipt appears here.",
  "receipt.colReceipt": "receipt",
  "receipt.colService": "service",
  "receipt.colAmount": "amount",
  "receipt.colDate": "date",
  "receipt.colTx": "tx signature",
  "receipt.colStatus": "status",
  "receipt.stConfirmed": "confirmed",
  "receipt.stFinalized": "finalized",
  "receipt.stPending": "pending…",
  "receipt.stFailed": "failed on-chain",
  "receipt.stUnknown": "unknown",
  "receipt.recorded": "receipt saved on this device",
  "receipt.clear": "Clear device history",
  "receipt.cleared": "Device history cleared",
  "receipt.count": "receipts on this device",
  "receipt.slot": "slot",
  "receipt.searchPh": "Search by service or tx signature…",
  "receipt.periodLabel": "Filter by period",
  "receipt.periodAll": "All time",
  "receipt.period24h": "Last 24h",
  "receipt.period7d": "Last 7d",
  "receipt.period30d": "Last 30d",
  "receipt.noMatch": "No receipts match this search. Clear the search box to see all {count} receipts.",
  "receipt.copyTx": "Copy tx signature",

  // --- Borrowed namespace ----------------------------------------------------
  // manage.leadStatus belongs to the i18n-static.ts manage.* namespace, but
  // that file is outside this slice's ownership and a missing data-i18n key
  // renders as the raw key (i18n.ts lookup falls back to the key itself).
  // Registered here until the static-slice owner adopts it (tracked as debt).
};

const pl: Dict = {
  "manage2.delegateActive": "Aktywna self-custodial delegacja",
  "manage2.delegateIdle": "Brak delegacji allowance on-chain",
  "manage2.engine": "Silnik reguł SPL-Token",
  "manage2.activeSubs": "aktywnych subskrypcji",
  "manage2.nextCharge": "najbliższa płatność",
  "manage2.noCharges": "brak nadchodzących płatności",
  "manage2.programStatus": "status programu",
  "manage2.anchorVerified": "Program: Anchor IDL zweryfikowany",
  "manage2.anchorTitle": "Program zgodny z IDL Anchor opublikowanym w /subscriptions/target/idl",
  "manage2.zeroCustody": "Zero-custody: środki zostają w Twoim portfelu do dnia płatności.",
  "manage2.ofWhich": "w tym",

  "manage2.kill": "Awaryjny kill-switch",
  "manage2.killHint": "Jedna transakcja cofa wszystkie zgody. Bez udziału programu.",
  "manage2.killArm": "Kliknij ponownie, aby cofnąć wszystkie zgody",
  "manage2.killWorking": "Cofanie…",
  "manage2.killed": "Wszystkie zgody cofnięte",
  "manage2.killFail": "Kill-switch nie powiódł się",
  "manage2.killEmpty": "Nic do cofnięcia — brak aktywnych zgód.",
  "manage2.killNoWallet": "Najpierw podłącz portfel.",

  "manage2.allowance": "Limit delegacji SPL",
  "manage2.allowanceLoading": "odczyt limitu…",
  "manage2.allowanceNone": "brak limitu (cofnięty lub niezatwierdzony)",
  "manage2.allowanceNoAta": "brak konta tokenowego dla tego mintu",
  "manage2.delegateTo": "delegat",
  "manage2.capNote": "limit = 1 okres",

  "receipt.title": "Historia pobrań i paragony on-chain",
  "receipt.lead": "Każdy wiersz zapisano w tej przeglądarce, gdy pobranie się potwierdziło. To nie jest indeks globalny.",
  "receipt.thisDevice": "To urządzenie",
  "receipt.deviceNote": "Zapisane w localStorage tej przeglądarki przy potwierdzeniu pobrania — na innym urządzeniu lista jest pusta.",
  "receipt.empty": "Brak paragonów na tym urządzeniu. Pobierz subskrypcję, a paragon pojawi się tutaj.",
  "receipt.colReceipt": "paragon",
  "receipt.colService": "usługa",
  "receipt.colAmount": "kwota",
  "receipt.colDate": "data",
  "receipt.colTx": "sygnatura tx",
  "receipt.colStatus": "status",
  "receipt.stConfirmed": "potwierdzona",
  "receipt.stFinalized": "sfinalizowana",
  "receipt.stPending": "oczekuje…",
  "receipt.stFailed": "odrzucona on-chain",
  "receipt.stUnknown": "nieznany",
  "receipt.recorded": "paragon zapisany na tym urządzeniu",
  "receipt.clear": "Wyczyść historię urządzenia",
  "receipt.cleared": "Historia urządzenia wyczyszczona",
  "receipt.count": "paragonów na tym urządzeniu",
  "receipt.slot": "slot",
  "receipt.searchPh": "Szukaj po usłudze lub sygnaturze tx…",
  "receipt.periodLabel": "Filtruj po okresie",
  "receipt.periodAll": "Cały okres",
  "receipt.period24h": "Ostatnie 24h",
  "receipt.period7d": "Ostatnie 7 dni",
  "receipt.period30d": "Ostatnie 30 dni",
  "receipt.noMatch": "Brak paragonów pasujących do wyszukiwania. Wyczyść pole wyszukiwania, aby zobaczyć całą listę ({count}).",
  "receipt.copyTx": "Kopiuj sygnaturę tx",

};

registerDict(en, pl);
