import { registerDict, type Dict } from "./i18n.js";

// ---------------------------------------------------------------------------
// Merchant Void-port dictionary (PortMerchant slice): batch queue header,
// memo-proof side panel, widget origin-lock + ownership notes, and the
// wallet signMessage-capability error (i18n-app.ts is outside this slice's
// edit scope, so wallet.ts pulls that one key from here). Static markup
// carries EN inline + data-i18n="port2.*"; reactive strings use $t("port2.*").
// Zero key overlap with i18n-static.ts / i18n-app.ts / i18n-merchant2.ts.
// Stitch source is Polish — EN is the inline default, PL lives below.
// ---------------------------------------------------------------------------

const en: Dict = {
  // --- Batch queue header (InvoicesPanel table block) ----------------------
  "port2.queue.title": "Invoice queue",
  "port2.queue.invoicesWord": "invoices",
  "port2.queue.selectedBatch": "selected for batch",
  "port2.queue.waiting": "waiting for the next batch",
  // Solana has no gas — the batch fee is base lamports per signature.
  "port2.queue.gas": "Est. batch network fee",
  "port2.queue.lamportsHint": "5000 lamports per signature",

  // --- Async button labels (no bare "…") ------------------------------------
  "port2.batch.working": "Charging…",
  "port2.form.loadingSub": "Loading…",
  "port2.form.signing": "Signing…",
  "port2.form.refreshing": "Refreshing…",
  "port2.form.detecting": "Detecting…",

  // --- Memo-proof side panel (InvoicesPanel aside) --------------------------
  // Truth note: this system sends NO SPL Memo instruction — createInvoiceIx
  // packs a 32-byte memo_hash into the invoice program instruction data
  // (actions/src/solana.ts). Labels describe that mechanism, not SPL Memo.
  "port2.memo.kicker": "Invoice memo (memo_hash)",
  "port2.memo.proof": "On-chain proof",
  "port2.memo.lead":
    "Every charge carries a compact memo_hash in the invoice account — a fiscally verifiable receipt hash, no central webhook.",
  "port2.memo.empty": "Select an invoice to preview its memo proof here.",
  "port2.memo.invoice": "Invoice",
  "port2.memo.program": "memo_hash · invoice PDA",
  "port2.memo.compliance": "Bookkeeping compliance",
  "port2.memo.complianceBody":
    "The memo hash lands in the Solana block — an immutable receipt an auditor can replay.",

  // --- Widget origin-lock + ownership notes (EmbedPanel) ---------------------
  "port2.lock.title": "Strict origin control",
  "port2.lock.body": "A mismatched domain fails with 403 before any delegation is registered.",
  "port2.embed.retry": "Try again",
  "port2.embed.ownership": "Ownership: signed by merchant + verified on-chain (plan.merchant)",
  "port2.embed.ownershipDetail":
    "Your wallet signed the canonical bind message, and the backend still re-read the plan account from RPC and matched plan.merchant before storing.",

  // --- Wallet capability error (thrown by wallet.ts signMessage) -------------
  "wallet.errSignMessage": "This wallet does not support message signing — use Phantom or Solflare.",
};

const pl: Dict = {
  "port2.queue.title": "Kolejka faktur",
  "port2.queue.invoicesWord": "faktur",
  "port2.queue.selectedBatch": "zaznaczonych do batcha",
  "port2.queue.waiting": "czeka na następną partię",
  "port2.queue.gas": "Szac. opłata sieciowa partii",
  "port2.queue.lamportsHint": "5000 lamportów za sygnaturę",

  "port2.batch.working": "Pobieranie…",
  "port2.form.loadingSub": "Wczytywanie…",
  "port2.form.signing": "Podpisywanie…",
  "port2.form.refreshing": "Odświeżanie…",
  "port2.form.detecting": "Wykrywanie…",

  "port2.memo.kicker": "Memo faktury (memo_hash)",
  "port2.memo.proof": "Dowód on-chain",
  "port2.memo.lead":
    "Każde pobranie zapisuje w koncie faktury kompaktowy memo_hash — weryfikowalny fiskalnie hash paragonu, bez centralnego webhooka.",
  "port2.memo.empty": "Wybierz fakturę, aby podejrzeć jej dowód memo.",
  "port2.memo.invoice": "Faktura",
  "port2.memo.program": "memo_hash · PDA faktury",
  "port2.memo.compliance": "Zgodność księgowa",
  "port2.memo.complianceBody":
    "Hash memo ląduje w bloku Solany — niezmienny paragon, który audytor może odtworzyć.",

  "port2.lock.title": "Rygorystyczna kontrola origin",
  "port2.lock.body": "Niezgodna domena kończy się błędem 403, zanim jakakolwiek delegacja zostanie zarejestrowana.",

  "port2.embed.retry": "Spróbuj ponownie",
  "port2.embed.ownership": "Własność: podpisana przez merchant + zweryfikowana on-chain (plan.merchant)",
  "port2.embed.ownershipDetail":
    "Twój portfel podpisał kanoniczną wiadomość wiązania, a backend nadal odczytał konto planu z RPC i porównał plan.merchant przed zapisem.",

  "wallet.errSignMessage": "Ten portfel nie obsługuje podpisywania wiadomości — użyj Phantom lub Solflare.",
};

registerDict(en, pl);
