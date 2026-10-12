import { registerDict } from "./i18n.js";

// ---------------------------------------------------------------------------
// Static-markup dictionary (Astro pages + Layout). EN is the default text
// baked into the markup; `data-i18n="key"` swaps to Polish via the LangToggle.
// Code terms (plan, approve, charge, PDA, …) stay in `font-mono` spans between
// translated segments, so they are never mangled by textContent replacement.
// ---------------------------------------------------------------------------

const en = {
  "nav.main": "Main",
  "nav.mobile": "Sections",
  "nav.clusterTitle": "Solana network",
  "a11y.skipToContent": "Skip to content",
  "nav.plans": "Plans",
  "nav.merchant": "Merchant",
  "nav.manage": "My subscriptions",
  "nav.blinks": "Blinks",
  "nav.examples": "Examples",
  "nav.explorer": "Explorer",

  "hero.badge": "recurring payments on-chain",
  "hero.title": "Subscriptions that live",
  "hero.titleAccent": "on-chain",
  "hero.leadA": "You approve a single ",
  "hero.leadB":
    " capped at one period — the contract pulls exactly one charge per period, and funds stay in your wallet until then.",
  "hero.browse": "Browse plans",
  "hero.create": "Create a plan as merchant",

  "stats.plansTop": "Plan count",
  "stats.plansLabel": "plans on-chain",
  "stats.plansHint": "getProgramAccounts · live",
  "stats.txTop": "Cost per charge",
  "stats.txLabel": "per period",
  "stats.txHint": "1 tx per period · 0.4% protocol fee + ~0.000005 SOL network fee",
  "stats.custodyTop": "Security model",
  "stats.custodyLabel": "custody",
  "stats.custodyHint": "funds stay in your ATA",
  "stats.blinkTop": "Blinks integration",
  "stats.blinkHint": "4 actions · self-hosted",
  "stats.blinkCaption": "Compatible with Twitter/X",

  "plans.title": "Live plans",
  "manage.leadStatus": "Cancelled",
  "plans.lead": "On-chain data. Subscribing = approve + subscribe in a single transaction.",

  "how.1title": "1 · Merchant lists a plan",
  "how.1a": "Put a mint, amount and billing period into a",
  "how.1b": "PDA — one merchant, many plans namespaced by",
  "how.1c": ". Terms are immutable, so a new price is simply a new plan.",
  "how.2title": "2 · You subscribe in one click",
  "how.2a": "Your wallet signs",
  "how.2b": "(delegate = subscription PDA, capped at 1 period) plus",
  "how.2c": "— atomically, in one transaction.",
  "how.3title": "3 · The contract charges every period",
  "how.3a": "goes through only when",
  "how.3b": ". Cancel anytime —",
  "how.3c": ".",

  "arch.eyebrow": "Zero Custody · SPL Delegate Engine",
  "arch.title": "How the OnchainSUB architecture works",
  "arch.lead":
    "Built on the native delegation mechanism of the Solana token program — no funds are ever frozen in a vault.",
  "arch.step1eyebrow": "STEP 01",
  "arch.step2eyebrow": "STEP 02",
  "arch.step3eyebrow": "STEP 03",

  "blinkprev.eyebrow": "Solana Actions & Blinks",
  "blinkprev.check1": "No redirects from X",
  "blinkprev.check2": "Phantom & Solflare native",
  "blinkprev.check3": "plan_id parametrized in the URL",
  "blinkprev.check4": "Metadata preview in Discord",
  "blinkprev.cardLabel": "blink preview · self-hosted",
  "blinkprev.actionUri": "solana-action://",
  "blinkprev.dialReady": "actions spec ready",
  "blinkprev.bannerLabel": "solana actions preview",
  "blinkprev.subTitle": "Subscribe",
  "blinkprev.merchantPrefix": "merchant ",
  "blinkprev.verifiedBy": "native in Phantom & Solflare",
  "blinkprev.subscribe": "Subscribe",
  "blinkprev.copied": "Copied",
  "blinkprev.viewJson": "view action JSON",
  "blinkprev.placeholderTitle": "No plans yet",
  "blinkprev.placeholderBody": "Create the first plan and it will preview here.",
  "blinkprev.cta": "Create a plan",

  "cta.titleA": "One link =",
  "cta.titleAccent": "one subscription",
  "cta.spec": "Actions spec docs",
  "cta.lead":
    "Turn any action — plan, subscription, cancel, charge — into a Blink. Paste the URL on X or Discord and people pay without ever opening this site.",
  "cta.action": "Build a Blink",

  "footer.modelA": "Model B: delegate +",
  "footer.modelB": "— zero custody, funds stay in the wallet until charge day.",
  "footer.navTitle": "Site",
  "footer.statusTitle": "Network",
  "footer.programLabel": "program",
  "footer.clusterLabel": "cluster",
  "footer.lang": "Language",

  "merchant.eyebrow": "for merchants",
  "merchant.h1": "Create a plan",
  "merchant.mod1Aria": "Module 01: plan creator",
  "merchant.mod2Aria": "Module 02: batch charging and invoicing",
  "merchant.mod3Aria": "Module 03: widget generator",
  "merchant.leadA": "Start getting paid on-chain in minutes. A plan is a",
  "merchant.leadB": "holding the mint, amount and period. Terms are immutable: a new price is a new",
  "merchant.leadC": ". You sign with your wallet; subscriber allowance is always exactly one period.",
  "merchant.afterTitle": "After creating",
  "merchant.after1a": "Your plan appears on the",
  "merchant.after1link": "plans list",
  "merchant.after1b": "once the transaction confirms.",
  "merchant.after2": "Hit ⚡ on the plan card to copy a Blink URL for sharing.",
  "merchant.after3a": "Collect payments with “Charge now” in",
  "merchant.after3link": "My subscriptions",
  "merchant.after3b": "once the period elapses.",

  "manage.eyebrow": "subscriber · merchant",
  "manage.h1": "My subscriptions",
  "manage.leadA":
    "See every subscription and its countdown to the next charge in one place. Connect your wallet — cancelling sets status",
  "manage.leadB":
    "and clears the delegate. If the connected wallet is the plan's merchant, you'll also see the charge button.",

  "blink.eyebrow": "solana actions · srfc-31",
  "blink.h1": "Blinks",
  "blink.leadA":
    "Turn any subscription into a link people can pay from X or Discord — no visit to this site needed. Every",
  "blink.leadB":
    "endpoint speaks the Actions protocol (GET metadata → POST unsigned tx → wallet signs). Paste the URL as",
  "blink.leadC":
    "on X or paste it in any wallet — subscribing happens wherever your users already are.",
  "blink.noteTitle": "Registry & chain",
  "blink.note1a": "maps",
  "blink.note1b": "to",
  "blink.note1c": "— swap the chain id for mainnet.",
  // note2a/note2b wrap the mono "solana-action:" span inside the list item.
  "blink.note2a": "Wallets consume",
  "blink.note2b":
    "URLs directly — no gateway needed. Full unfurl on X still needs a registered actions.json entry.",
  "blink.note3a": "A",
  "blink.note3b": "POST always bundles an",
  "blink.note3c": "capped at one period — a Blink can never authorize more.",
  "merchant.after4a": "Sell on your own site: bind a domain to a plan below, paste the snippet, and see live use-cases on",
  "merchant.after4link": "examples",
  "merchant.after4b": "— a stolen snippet stops at a 403 page.",

  // ---- 404.astro (prerendered custom not-found page) ----
  "nf.eyebrow": "http 404 · not found",
  "nf.title": "Page not found",
  "nf.lead":
    "This address does not exist on OnchainSUB. If you followed a Blink or Action link, the plan behind it may be gone — check the URL or browse the live plans.",
  "nf.backPlans": "Browse live plans",
  "nf.backBlinks": "Open the Blink builder",
};

const pl = {
  "nav.main": "Główna",
  "nav.mobile": "Sekcje",
  "nav.clusterTitle": "Sieć Solana",
  "nav.manageShort": "Subskrypcje",
  "a11y.skipToContent": "Przejdź do treści",
  "nav.plans": "Plany",
  "nav.merchant": "Merchant",
  "nav.manage": "Moje subskrypcje",
  "nav.blinks": "Blinki",
  "nav.examples": "Przykłady",
  "nav.explorer": "Eksplorator",

  "hero.badge": "cykliczne płatności on-chain",
  "hero.title": "Subskrypcje, które żyją",
  "hero.titleAccent": "on-chain",
  "hero.leadA": "Autoryzujesz jedną ",
  "hero.leadB":
    " z limitem jednego okresu — kontrakt pobiera dokładnie jeden charge na okres, a środki zostają w portfelu do dnia płatności.",
  "hero.browse": "Przeglądaj plany",
  "hero.create": "Utwórz plan jako merchant",

  "stats.plansTop": "Liczba planów",
  "stats.plansLabel": "planów on-chain",
  "stats.plansHint": "getProgramAccounts · live",
  "stats.txTop": "Koszt pobrania",
  "stats.txLabel": "na okres",
  "stats.txHint": "1 tx na okres · 0,4% opłaty protokołu + ~0,000005 SOL opłaty sieciowej",
  "stats.custodyTop": "Model bezpieczeństwa",
  "stats.custodyLabel": "custody",
  "stats.custodyHint": "środki zostają w Twoim ATA",
  "stats.blinkTop": "Integracja Blinks",
  "stats.blinkHint": "4 akcje · self-hosted",
  "stats.blinkCaption": "Kompatybilne z Twitter/X",

  "plans.title": "Aktywne plany",
  "manage.leadStatus": "Anulowana",
  "plans.lead": "Dane na żywo z łańcucha. Subskrypcja = approve + subscribe w jednej transakcji.",

  "how.1title": "1 · Merchant wystawia plan",
  "how.1a": "Wpisz mint, kwotę i okres rozliczeniowy — trafią do konta",
  "how.1b": "— jeden merchant, wiele planów dzięki",
  "how.1c": ". Warunki są niezmienne: nowa cena to po prostu nowy plan.",
  "how.2title": "2 · Subskrybujesz jednym klikiem",
  "how.2a": "Twój portfel podpisuje",
  "how.2b": "(delegate = PDA subskrypcji, limit = 1 okres) oraz",
  "how.2c": "— atomowo, w jednej transakcji.",
  "how.3title": "3 · Kontrakt pobiera co okres",
  "how.3a": "przechodzi tylko, gdy",
  "how.3b": ". Anulujesz w każdej chwili —",
  "how.3c": ".",

  "arch.eyebrow": "Zero Custody · Silnik Delegacji SPL",
  "arch.title": "Jak działa architektura OnchainSUB?",
  "arch.lead":
    "Proces oparty na natywnym mechanizmie delegacji Solana token program — żadne środki nie są zamrażane w skarbcu.",
  "arch.step1eyebrow": "KROK 01",
  "arch.step2eyebrow": "KROK 02",
  "arch.step3eyebrow": "KROK 03",

  "blinkprev.eyebrow": "Solana Actions i Blinks",
  "blinkprev.check1": "Bez przekierowań z X",
  "blinkprev.check2": "Phantom i Solflare natywnie",
  "blinkprev.check3": "Parametryzacja plan_id w URL",
  "blinkprev.check4": "Podgląd metadanych w Discord",
  "blinkprev.cardLabel": "podgląd blinka · self-hosted",
  "blinkprev.actionUri": "solana-action://",
  "blinkprev.dialReady": "zgodne ze specyfikacją Actions",
  "blinkprev.bannerLabel": "podgląd akcji Solana",
  "blinkprev.subTitle": "Subskrybuj",
  "blinkprev.merchantPrefix": "merchant: ",
  "blinkprev.verifiedBy": "natywnie w Phantom i Solflare",
  "blinkprev.subscribe": "Subskrybuj",
  "blinkprev.copied": "Skopiowano",
  "blinkprev.viewJson": "podgląd JSON akcji",
  "blinkprev.placeholderTitle": "Brak planów",
  "blinkprev.placeholderBody": "Utwórz pierwszy plan, a jego podgląd pojawi się tutaj.",
  "blinkprev.cta": "Utwórz plan",

  "cta.titleA": "Jeden link =",
  "cta.titleAccent": "jedna subskrypcja",
  "cta.spec": "Specyfikacja Actions",
  "cta.lead":
    "Zamień dowolną akcję — plan, subskrypcję, anulowanie, pobranie — w Blinka. Wklej URL na X lub Discordzie i ludzie płacą, nigdy nie otwierając tej strony.",
  "cta.action": "Zbuduj Blinka",

  "footer.modelA": "Model B: delegate +",
  "footer.modelB": "— zero custody, środki zostają w portfelu do dnia płatności.",
  "footer.navTitle": "Nawigacja",
  "footer.statusTitle": "Sieć",
  "footer.programLabel": "program",
  "footer.clusterLabel": "klaster",
  "footer.lang": "Język",

  "merchant.eyebrow": "dla merchantów",
  "merchant.h1": "Utwórz plan",
  "merchant.mod1Aria": "Moduł 01: tworzenie planu",
  "merchant.mod2Aria": "Moduł 02: masowe obciążenia i faktury",
  "merchant.mod3Aria": "Moduł 03: generator widgetu",
  "merchant.leadA": "Zacznij przyjmować płatności on-chain w kilka minut. Plan to konto",
  "merchant.leadB": "z mintem, kwotą i okresem. Warunki są niezmienne: nowy cennik to nowy",
  "merchant.leadC": ". Transakcję podpisujesz swoim portfelem; limit zgody subskrybenta to zawsze dokładnie jeden okres.",
  "merchant.afterTitle": "Po utworzeniu",
  "merchant.after1a": "Plan pojawi się na",
  "merchant.after1link": "liście planów",
  "merchant.after1b": "po potwierdzeniu transakcji.",
  "merchant.after2": "Kliknij ⚡ na karcie planu, żeby skopiować URL Blinka do udostępnienia.",
  "merchant.after3a": "Płatności pobierasz przyciskiem „Pobierz teraz” w",
  "merchant.after3link": "Moich subskrypcjach",
  "merchant.after3b": ", gdy okres minie.",

  "manage.eyebrow": "subskrybent · merchant",
  "manage.h1": "Moje subskrypcje",
  "manage.leadA":
    "Zobacz wszystkie subskrypcje z licznikiem do następnej płatności w jednym miejscu. Podłącz portfel — anulowanie ustawia status",
  "manage.leadB":
    "i czyści delegate. Jeśli podłączony portfel jest merchantem planu, zobaczysz też przycisk pobrania.",

  "blink.eyebrow": "solana actions · srfc-31",
  "blink.h1": "Blinki",
  "blink.leadA":
    "Zamień subskrypcję w link, który ludzie opłacą z X-a lub Discorda — bez wchodzenia na tę stronę. Każdy endpoint",
  "blink.leadB":
    "mówi protokołem Actions (GET metadane → POST niepodpisana tx → podpis w portfelu). Wklej URL jako",
  "blink.leadC":
    "na X-ie albo wklej go w dowolnym portfelu — subskrypcja dzieje się tam, gdzie już są Twoi użytkownicy.",
  "blink.noteTitle": "Rejestr i łańcuch",
  "blink.note1a": "mapuje",
  "blink.note1b": "na",
  "blink.note1c": "— na mainnet podmień chain id.",
  // note2a/note2b opisują mono-span "solana-action:" wewnątrz punktu listy.
  "blink.note2a": "Portfele konsumują",
  "blink.note2b":
    "URL-e bezpośrednio — bez bramki. Pełny unfurl na X-ie nadal wymaga zarejestrowanego actions.json.",
  "blink.note3a": "",
  "blink.note3b": "POST zawsze zawiera",
  "blink.note3c": "z limitem jednego okresu — Blink nie może autoryzować więcej.",
  "merchant.after4a": "Sprzedawaj na własnej stronie: podepnij domenę pod plan poniżej, wklej snippet i zobacz żywe zastosowania na",
  "merchant.after4link": "przykładach",
  "merchant.after4b": "— skradziony snippet kończy się stroną 403.",

  "nf.eyebrow": "http 404 · nie znaleziono",
  "nf.title": "Nie znaleziono strony",
  "nf.lead":
    "Ten adres nie istnieje w OnchainSUB. Jeśli trafiłeś tu z linku Blink lub Akcji, plan mógł zniknąć — sprawdź URL albo przejrzyj aktywne plany.",
  "nf.backPlans": "Przeglądaj aktywne plany",
  "nf.backBlinks": "Otwórz kreator Blinków",
};

registerDict(en, pl);
