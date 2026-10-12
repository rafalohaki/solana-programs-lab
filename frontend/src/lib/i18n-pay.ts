import { registerDict, type Dict } from "./i18n.js";

// ---------------------------------------------------------------------------
// Checkout-sim slice dictionary (Agent CheckoutSim): /pay simulator,
// /examples case gallery, /blink integration block. EN default baked into
// markup; PL swaps via data-i18n. Zero key overlap with other slices:
// paysim.* / payex.* / blinkx.* / payerr.* / pay.status.* only (payerr covers
// the /pay SSR gate error card; pay.status covers the live checkout status
// line driven by pay-checkout.ts, which fills {param} placeholders itself).
// ---------------------------------------------------------------------------

const en: Dict = {
  // ---- /pay simulator ----
  "paysim.eyebrow": "checkout · domain-bound execution",
  "paysim.simAria": "Checkout simulator",
  "paysim.h1": "Embeddable Checkout & Domain Protection",
  "paysim.lead":
    "Interactive execution-environment simulator. Tab 1 runs the real server-gated checkout below. Tabs 2–3 are labelled mock previews: they never change the host, never touch the server gate — they show what an attacker (or an outage) would see.",
  "paysim.tabOk": "1. Authorized domain",
  "paysim.tabPhish": "2. Phishing attack (403 Origin)",
  "paysim.tabFallback": "3. API outage (502 Fallback)",
  "paysim.simState": "SIMULATION STATE:",
  "paysim.stateLive": "LIVE — real server gate",
  "paysim.stateMock": "MOCK PREVIEW — server gate untouched",
  "paysim.hostLabel": "HOST:",
  "paysim.liveCheckLabel": "Live domain-bind check:",
  "paysim.liveCheckPending": "checking…",
  "paysim.mockBadge": "MOCK PREVIEW — no host change, no funds move",
  "paysim.mockBadgeShort": "MOCK",
  "paysim.liveBadge": "LIVE — real checkout, real wallet",
  "paysim.proofTitle": "How the checkout is protected",
  "paysim.proofBadge": "mechanics, not metrics",
  "paysim.step1t": "1. Merchant domain registration",
  "paysim.step1b":
    "The merchant binds their domain to a plan off-chain (POST /api/widget/sites). The server gate compares the checkout host against that binding on every load — a foreign host ends at 403.",
  "paysim.step2t": "2. Origin & iframe validation",
  "paysim.step2b":
    "The popup URL carries ?plan=<address>&host=<domain>. The server re-checks the pair before serving the checkout. A copied snippet on another domain fails this check even though the markup is identical.",
  "paysim.step3t": "3. SPL allowance & zero custody",
  "paysim.step3b":
    "Subscribing signs an approve capped at exactly one period plus subscribe, atomically. The delegate can only pay the plan merchant — a domain thief has no path to your funds.",
  "paysim.memoTitle": "RAW PLAN MEMO (live from chain):",
  "paysim.memoEmpty": "No on-chain memo — the plan failed to load (see live status above).",
  "paysim.whyTitle": "Why a domain thief gets nothing",
  "paysim.whyBody":
    "Even if an attacker copies the whole iframe onto a prepared lookalike page, the on-chain delegate pays only the merchant stored in the plan account. The stolen snippet renders a 403 page and can never move funds.",
  "paysim.phishBar": "https://evil.com/pricing/enterprise",
  "paysim.phishNote":
    "You are still on this host. This panel only previews the 403 page a visitor would see on evil.com — the address bar above is a mock label, not a navigation.",
  "paysim.fallbackNote":
    "Preview of an outage: the domain-bind service is unreachable (502), so the popup cannot prove the host. The merchant backup is a direct Blink URL — same plan, same one-period approve cap, no hosted checkout needed.",
  "paysim.fallbackStep1": "Copy the direct Action URL for this plan.",
  "paysim.fallbackStep2": "Paste it into any wallet as a solana-action: link — no gateway needed.",
  "paysim.fallbackStep3": "The wallet signs the same approve-capped transaction — the subscriber never pays more than one period.",
  "paysim.copyBlink": "Copy Blink URL",
  "paysim.openBlink": "Open Blink builder",
  "paysim.legendTitle": "What is live vs mocked on this page",
  "paysim.legendLive": "Live: the authorized-domain checkout, plan/merchant/amount loaded from RPC, and the domain-bind check below.",
  "paysim.legendMock": "Mock: the phishing 403 and outage 502 panels — static previews, explicitly badged, moving no funds.",
  "paysim.merchantHint": "Merchant? Bind your domain via",
  "paysim.merchantHintTail": "— see the live widget demo.",
  "paysim.consoleTitle": "Attack & environment console",
  "paysim.consoleDesc": "Switch attack vectors to test the server gate, origin authorization and the RPC fallback path.",
  "paysim.barVerified": "VERIFIED TLS + PDA",
  "paysim.barInvalid": "INVALID CERT & ORIGIN",
  "paysim.barDirect": "DIRECT SOLANA RPC",
  "paysim.blockedCta": "Transaction blocked — unauthorized domain",
  // Tail of the demo banner on the live checkout card; the leading "DEMO"
  // pill comes from .chip-pastdue in the markup.
  "paysim.demoBanner": "fixture plan, no fetch. Banner exit returns to live data.",
  "paysim.outageBanner": "Gate unreachable — direct RPC fallback ready",
  // Self-hosted Actions CTA: opens our own endpoint (GET renders the action
  // JSON); replaces the old gateway-mediated "sign directly" label.
  "paysim.openEndpoint": "Open actions endpoint",
  "paysim.routeProgram": "Program",
  "paysim.routeRpc": "RPC endpoint",
  "paysim.routeAmount": "Amount",
  "paysim.trayProgramLabel": "PDA PROGRAM",
  "paysim.bindMetric": "DOMAIN-BIND",
  "paysim.bindMetricSub": "Host the server gate checks on every load",
  "paysim.feeMetric": "COLLECTION FEE",
  "paysim.feeMetricSub": "0.4% of every charge — on-chain constant (FEE_BPS)",
  "paysim.memoStateLive": "LOADED FROM RPC",
  "paysim.memoStateDemo": "DEMO FIXTURE",
  "paysim.memoStateError": "UNAVAILABLE",
  // Declared-host labeling: ?host= is untrusted input (the server /check
  // answers about the param, not about the page that opened the popup) —
  // never render it as a verified match.
  "paysim.declaredHostLabel": "DECLARED HOST:",
  "paysim.hostMismatchWarning":
    "Warning: this popup was opened from a different site than the declared host — verify the address before paying.",
  // Merchant row copy-verify (address-poisoning defense): tooltip + screen
  // reader labels for the copy and Explorer actions.
  "paysim.copyMerchantTitle": "Copy the full merchant address and verify it in your wallet.",
  "paysim.copyMerchantSr": "Copy merchant address",
  "paysim.explorerTitle": "Open the merchant address in the Solana Explorer.",
  "paysim.explorerSr": "Merchant address on Explorer",

  // ---- /pay SSR gate error card (mono "HTTP {status}" stays untranslated) ----
  "payerr.demoHeadline": "Demo unavailable",
  "payerr.demoDetail": "Demo fixtures failed to load. Retry or continue without ?demo=1.",
  "payerr.missingPlanHeadline": "Missing plan",
  "payerr.missingPlanDetail": "Open this checkout through a merchant site (expected ?plan=<address>&host=<domain>).",
  "payerr.gateDownHeadline": "Checkout unavailable",
  "payerr.gateDownDetail": "The domain-bind service is unreachable. Try again in a moment.",
  "payerr.planNotFoundHeadline": "Plan not found",
  "payerr.planNotFoundDetail": "No plan account exists at this address on the configured cluster.",
  "payerr.chainDownHeadline": "Chain read failed",
  "payerr.chainDownDetail": "Could not load the plan from RPC. Check the cluster and retry.",

  // ---- /pay live checkout status line (pay-checkout.ts; {param} filled by
  // the status() helper, kept literal here) ----
  "pay.status.noWallet": "No wallet found — install Phantom or Solflare.",
  "pay.status.noWalletSub": "No wallet found — install Phantom or Solflare first.",
  "pay.status.connected": "Connected: {address}",
  "pay.status.rejected": "Connection rejected.",
  "pay.status.misconfigured": "Checkout misconfigured (no endpoint).",
  "pay.status.building": "Building transaction…",
  "pay.status.sending": "Sending… confirm in your wallet.",
  "pay.status.paid": "Paid: {signature}",
  "pay.status.failed": "Subscription failed.",

  // ---- /examples gallery ----
  "payex.eyebrow": "provable protocol · model B architecture",
  "payex.h1": "Case studies in the execution environment, plus a live widget demo.",
  "payex.lead":
    "No slides. Four subscription shapes, each the same two primitives — an on-chain plan plus the embeddable widget or a Blink. The widget below is live: it runs the real popup checkout against the plan in the URL.",
  "payex.badgeCustody": "0% CUSTODY (Model B)",
  "payex.badgeTx": "1 TX / PERIOD",
  // NOTE: the payex.case1-4 keys were deleted (2026-10 QA pass) — the active
  // case-study copy lives in flows2.case1-4; these described a different,
  // unused set of case studies. Nothing referenced them (grepped).
  "payex.liveTitle": "Embedded Checkout Widget",
  "payex.liveBadge": "LIVE RUNTIME",
  "payex.consoleTitle": "Transaction observer console",
  "payex.consoleBadge": "PAGE-LOCAL — NO FAKE FEED",
  "payex.consoleIdle":
    "Idle — waiting for your click in the widget. This console only reflects this page: button state, popup result, and signature. No websocket, no simulated traffic.",
  "payex.codeEyebrow": "widget snippet · 3 lines",
  "payex.codeTitle": "3 lines of code. Zero boilerplate.",
  "payex.codeLead":
    "No backend cron, no escrow, no custodial vault. Paste the snippet, bind your domain, and the popup handles approve + subscribe in one transaction.",
  "payex.codeNote1": "No backend cron — the contract charges one period per transaction.",
  "payex.codeNote2": "No escrow — funds stay in the subscriber wallet until charge day.",
  "payex.codeNote3": "Popup checkout stops at 403 on foreign domains.",
  "payex.legendLive": "Live: the widget button, the popup checkout, and the observer state after you click.",
  "payex.legendMock": "Mock: nothing on this page is simulated — case cards describe mechanics, numbers come only from your ?plan= account.",

  // ---- /blink integration block ----
  "blinkx.integTitle": "3-line integration",
  "blinkx.integLead":
    "Render the subscribe Action anywhere. The URL below is live for the plan currently selected in the builder — paste the solana-action: URL into any wallet and it signs the same one-period-capped transaction as the popup.",
  "blinkx.copyUrl": "Copy Blink URL",
  "blinkx.copied": "Copied.",
  "blinkx.checkTitle": "Ship checklist",
  "blinkx.check1": "Wallets (Phantom, Solflare) consume the solana-action: URL directly — no gateway, no registry entry.",
  "blinkx.check2": "Discord embed renders the same Action metadata (title, description, icon).",
  "blinkx.check3": "Full unfurl on X with your own domain needs a registered actions.json entry.",
};

const pl: Dict = {
  "paysim.eyebrow": "checkout · wykonanie powiązane z domeną",
  "paysim.simAria": "Symulator checkout",
  "paysim.h1": "Osadzalny Checkout i ochrona domeny",
  "paysim.lead":
    "Interaktywny symulator środowiska wykonawczego. Zakładka 1 uruchamia prawdziwy checkout z bramką serwerową. Zakładki 2–3 to oznaczone podglądy mock: nie zmieniają hosta i nie dotykają bramki — pokazują, co zobaczyłby atakujący (lub awaria).",
  "paysim.tabOk": "1. Autoryzowana domena",
  "paysim.tabPhish": "2. Atak phishing (403 Origin)",
  "paysim.tabFallback": "3. Awaria API (502 Fallback)",
  "paysim.simState": "STAN SYMULACJI:",
  "paysim.stateLive": "LIVE — prawdziwa bramka serwerowa",
  "paysim.stateMock": "PODGLĄD MOCK — bramka nietknięta",
  "paysim.hostLabel": "HOST:",
  "paysim.liveCheckLabel": "Kontrola powiązania domeny na żywo:",
  "paysim.liveCheckPending": "sprawdzanie…",
  "paysim.mockBadge": "PODGLĄD MOCK — bez zmiany hosta, bez ruchu środków",
  "paysim.mockBadgeShort": "MOCK",
  "paysim.liveBadge": "LIVE — prawdziwy checkout, prawdziwy portfel",
  "paysim.proofTitle": "Jak chroniony jest ten checkout",
  "paysim.proofBadge": "mechanika, nie metryki",
  "paysim.step1t": "1. Rejestracja domeny merchanta",
  "paysim.step1b":
    "Merchant wiąże domenę z planem (POST /api/widget/sites). Bramka porównuje host checkoutu z tym wiązaniem przy każdym ładowaniu — obcy host kończy na 403.",
  "paysim.step2t": "2. Walidacja Origin i iframe",
  "paysim.step2b":
    "URL popupa niesie ?plan=<adres>&host=<domena>. Serwer sprawdza parę przed wydaniem checkoutu. Skopiowany snippet na obcej domenie oblewa tę kontrolę, choć markup jest identyczny.",
  "paysim.step3t": "3. Zgoda SPL i zero custody",
  "paysim.step3b":
    "Subskrypcja podpisuje approve z limitem dokładnie jednego okresu plus subscribe, atomowo. Delegate może płacić tylko merchantowi planu — złodziej domeny nie ma ścieżki do środków.",
  "paysim.memoTitle": "SUROWE MEMO PLANU (na żywo z łańcucha):",
  "paysim.memoEmpty": "Brak memo on-chain — plan nie załadował się (patrz status na żywo wyżej).",
  "paysim.whyTitle": "Dlaczego złodziej domen nie pobierze środków",
  "paysim.whyBody":
    "Nawet jeśli oszust skopiuje cały iframe na podrobioną stronę, delegate on-chain płaci tylko merchantowi zapisanemu w koncie planu. Skradziony snippet renderuje stronę 403 i nigdy nie ruszy środków.",
  "paysim.phishBar": "https://evil.com/pricing/enterprise",
  "paysim.phishNote":
    "Nadal jesteś na tym hoście. Ten panel tylko pokazuje stronę 403, którą zobaczyłby gość na evil.com — pasek adresu wyżej to etykieta mocka, nie nawigacja.",
  "paysim.fallbackNote":
    "Podgląd awarii: serwis powiązań domen jest nieosiągalny (502), więc popup nie udowodni hosta. Backup merchanta to bezpośredni URL Blinka — ten sam plan, ten sam limit jednego okresu, bez hostowanego checkoutu.",
  "paysim.fallbackStep1": "Skopiuj bezpośredni URL Akcji dla tego planu.",
  "paysim.fallbackStep2": "Wklej go do dowolnego portfela jako link solana-action: — bez żadnej bramki.",
  "paysim.fallbackStep3": "Portfel podpisuje tę samą transakcję z limitem — subskrybent nigdy nie płaci więcej niż za jeden okres.",
  "paysim.copyBlink": "Kopiuj URL Blinka",
  "paysim.openBlink": "Otwórz kreator Blinków",
  "paysim.legendTitle": "Co jest live, a co mockiem na tej stronie",
  "paysim.legendLive": "Live: checkout autoryzowanej domeny, plan/merchant/kwota z RPC oraz kontrola powiązania domeny poniżej.",
  "paysim.legendMock": "Mock: panele phishing-403 i awarii-502 — statyczne podglądy, jawnie oznaczone, bez ruchu środków.",
  "paysim.merchantHint": "Merchant? Podepnij domenę przez",
  "paysim.merchantHintTail": "— patrz żywe demo widgetu.",
  "paysim.consoleTitle": "Konsola ataków i środowiska",
  "paysim.consoleDesc": "Przełącz wektory ataków, by przetestować bramkę serwerową, autoryzację origin i ścieżkę fallback RPC.",
  "paysim.barVerified": "ZWERYFIKOWANO TLS + PDA",
  "paysim.barInvalid": "NIEPRAWIDŁOWY CERTYFIKAT I ORIGIN",
  "paysim.barDirect": "BEZPOŚREDNI RPC SOLANA",
  "paysim.blockedCta": "Transakcja zablokowana — nieautoryzowana domena",
  "paysim.demoBanner": "plan z fixtury, bez fetcha. Wyjście z banera wraca do danych live.",
  "paysim.outageBanner": "Bramka nieosiągalna — fallback bezpośredniego RPC gotowy",
  "paysim.openEndpoint": "Otwórz endpoint Actions",
  "paysim.routeProgram": "Program",
  "paysim.routeRpc": "Punkt RPC",
  "paysim.routeAmount": "Kwota",
  "paysim.trayProgramLabel": "PROGRAM PDA",
  "paysim.bindMetric": "WIĄZANIE DOMENY",
  "paysim.bindMetricSub": "Host sprawdzany przez bramkę przy każdym ładowaniu",
  "paysim.feeMetric": "OPŁATA POBORU",
  "paysim.feeMetricSub": "0,4% od każdego pobrania — stała on-chain (FEE_BPS)",
  "paysim.memoStateLive": "WCZYTANO Z RPC",
  "paysim.memoStateDemo": "FIXTURA DEMO",
  "paysim.memoStateError": "NIEDOSTĘPNE",
  "paysim.declaredHostLabel": "DEKLAROWANY HOST:",
  "paysim.hostMismatchWarning":
    "Ostrzeżenie: ten popup otwarto z innej strony niż zadeklarowany host — zweryfikuj adres przed płatnością.",
  "paysim.copyMerchantTitle": "Skopiuj pełny adres merchanta i zweryfikuj go w portfelu.",
  "paysim.copyMerchantSr": "Kopiuj adres merchanta",
  "paysim.explorerTitle": "Otwórz adres merchanta w Solana Explorer.",
  "paysim.explorerSr": "Adres merchanta w Explorerze",

  // ---- /pay SSR gate error card (mono "HTTP {status}" stays untranslated) ----
  "payerr.demoHeadline": "Demo niedostępne",
  "payerr.demoDetail": "Fixtury demo nie wczytały się. Spróbuj ponownie albo przejdź dalej bez ?demo=1.",
  "payerr.missingPlanHeadline": "Brak planu",
  "payerr.missingPlanDetail": "Otwórz ten checkout przez stronę merchanta (oczekiwane ?plan=<adres>&host=<domena>).",
  "payerr.gateDownHeadline": "Checkout niedostępny",
  "payerr.gateDownDetail": "Serwis powiązań domen jest nieosiągalny. Spróbuj ponownie za chwilę.",
  "payerr.planNotFoundHeadline": "Nie znaleziono planu",
  "payerr.planNotFoundDetail": "Konto planu nie istnieje pod tym adresem na skonfigurowanym klastrze.",
  "payerr.chainDownHeadline": "Błąd odczytu łańcucha",
  "payerr.chainDownDetail": "Nie udało się wczytać planu z RPC. Sprawdź klaster i spróbuj ponownie.",

  // ---- /pay live checkout status line ----
  "pay.status.noWallet": "Nie znaleziono portfela — zainstaluj Phantom lub Solflare.",
  "pay.status.noWalletSub": "Nie znaleziono portfela — najpierw zainstaluj Phantom lub Solflare.",
  "pay.status.connected": "Połączono: {address}",
  "pay.status.rejected": "Połączenie odrzucone.",
  "pay.status.misconfigured": "Checkout źle skonfigurowany (brak endpointu).",
  "pay.status.building": "Budowanie transakcji…",
  "pay.status.sending": "Wysyłanie… potwierdź w portfelu.",
  "pay.status.paid": "Opłacono: {signature}",
  "pay.status.failed": "Subskrypcja nieudana.",

  "payex.eyebrow": "protokół dowodliwy · architektura model B",
  "payex.h1": "Case studies w środowisku wykonawczym i żywe demo widgetu.",
  "payex.lead":
    "Bez slajdów. Cztery kształty subskrypcji, każdy z tych samych dwóch prymitywów — plan on-chain plus osadzalny widget albo Blink. Widget poniżej jest live: uruchamia prawdziwy popup dla planu z URL.",
  "payex.badgeCustody": "0% CUSTODY (Model B)",
  "payex.badgeTx": "1 TX / OKRES",
  "payex.liveTitle": "Osadzony Widget Checkout",
  "payex.liveBadge": "LIVE RUNTIME",
  "payex.consoleTitle": "Konsola obserwatora transakcji",
  "payex.consoleBadge": "LOKALNA STRONA — BEZ FAŁSZYWEGO FEEDU",
  "payex.consoleIdle":
    "Bezczynnie — czeka na Twój klik w widgecie. Ta konsola odzwierciedla tylko tę stronę: stan przycisku, wynik popupa i sygnaturę. Bez websocketu, bez symulowanego ruchu.",
  "payex.codeEyebrow": "snippet widgetu · 3 linijki",
  "payex.codeTitle": "3 linijki kodu. Zero boilerplate.",
  "payex.codeLead":
    "Bez backendowego crona, bez escrow, bez vaultu custody. Wklej snippet, podepnij domenę, a popup obsłuży approve + subscribe w jednej transakcji.",
  "payex.codeNote1": "Bez backendowego crona — kontrakt pobiera jeden okres na transakcję.",
  "payex.codeNote2": "Bez escrow — środki zostają w portfelu subskrybenta do dnia płatności.",
  "payex.codeNote3": "Popup kończy się stroną 403 na obcych domenach.",
  "payex.legendLive": "Live: przycisk widgetu, popup checkout i stan obserwatora po kliknięciu.",
  "payex.legendMock": "Mock: nic tu nie jest symulowane — karty opisują mechanikę, liczby tylko z konta ?plan=.",

  "blinkx.integTitle": "Integracja w 3 linijki",
  "blinkx.integLead":
    "Wyrenderuj Akcję subskrypcji gdziekolwiek. URL poniżej jest live dla planu wybranego w kreatorze — wklej URL solana-action: w dowolnym portfelu, a podpisze tę samą transakcję z limitem jednego okresu co popup.",
  "blinkx.copyUrl": "Kopiuj URL Blinka",
  "blinkx.copied": "Skopiowano.",
  "blinkx.checkTitle": "Checklista wdrożenia",
  "blinkx.check1": "Portfele (Phantom, Solflare) konsumują URL solana-action: bezpośrednio — bez bramki i wpisu w rejestrze.",
  "blinkx.check2": "Embed na Discordzie renderuje te same metadane Akcji (tytuł, opis, ikona).",
  "blinkx.check3": "Pełny unfurl na X z własną domeną wymaga wpisu actions.json w rejestrze.",
};

registerDict(en, pl);
