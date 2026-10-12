# Legal & compliance — audyt 6 ryzyk + plan napraw

Audyt: 2026-10-08. Status: runda 6 (naprawy) w kolejce zaraz po rundzie 5.
Skala: apka na **devnet** (demo/hackathon), domena `solhack.rafal.si` (.pl), operator najpewniej EU/PL —
uwzględniam FTC ROSCA (US) + EU DSA/consumer-acquis (2b2t.pl).

---

## 1. Age gate przy rejestracji — **BRAK → dodajemy**

Stan: brak jakiegokolwiek potwierdzenia wieku (grep: 0 trafień).

Kontekst prawny: same płatności subskrypcyjne nie są treścią „18+", ale **rozporządzenie wiekowe
pojawia się przy regulaminach usług finansowych** i wielu konkurach (w tym tracki Colosseum/Solana
sponsoringowane przez podmioty z USA) oczekuje potwierdzenia legal capacity. Robimy gate bez
frustracji: **jednorazowe potwierdzenie 18+ przy pierwszej wizycie** (modal, localStorage) +
checkbox w modalu portfela.

Plan (runda 6):
- `AgeGate.svelte` w Layout (przed slotem), `localStorage: solhack:age-ok`, styl Void Protocol,
  Escape nie zamyka (musisz wybrać), link „why we ask".
- Env `PUBLIC_AGE_GATE=on|off` (domyślnie on; łatwo wyłączyć).

## 2. Samohostowane fonty — **ZŁE → naprawiamy (najpoważniejsze formalnie)**

Stan: `Layout.astro:62-70` ładuje **fonts.googleapis.com + fonts.gstatic.com** (Inter, JetBrains Mono,
Space Grotesk, Material Symbols). Wyrok LG München (20.01.2022, 3 O 15522/21 OLG 25): dynamiczne
pobieranie fontów z Google przekazuje IP użytkownika do Google bez zgody → naruszenie GDPR art. 6.
Material Symbols to ten sam problem + kolejny zewnętrzny request.

Plan (runda 6):
- `frontend/public/fonts/` — self-host woff2: Space Grotesk 500/700, Inter 400/500/600,
  JetBrains Mono 400/500, **subset Material Symbols** (tylko używane glify — `text=` param API
  generuje mały plik; skrypt `scripts/fonts.sh` ściąga i podmienia, powtarzalny).
- `@font-face` w `global.css` + `font-display: swap`; usunięcie linków Google z Layout.astro.
- Bonus wydajnościowy: zero requestów do Google = szybszy first paint.

## 3. Session replay — **NIE MA ✓ (utrzymujemy + zabezpieczamy)**

Stan: grep po posthog/amplitude/hotjar/clarity/fullstory/mixpanel/sentry/plausible/umami/segment —
**zero bibliotek analitycznych i replay**. Nic do wyłączenia.

Plan (runda 6):
- Zostaje tak (najbezpieczniejsza opcja).
- Dodajemy nagłówki zapobiegające przypadkowemu wklejeniu trackerów: CSP
  (`default-src 'self'`, `script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`,
  `font-src 'self'`, `img-src 'self' data:`, `connect-src 'self'`) — UWAGA: bez `frame-ancestors 'none'`,
  bo checkout jest osadzany u merchantów przez iframe. Test po wdrożeniu (e2e + wizual).
- Sekcja w README: „No analytics, no session replay, no third-party trackers."

## 4. E-maile: unsubscribe + adres pocztowy — **BRAK → dodajemy**

Stan: `backend/src/mail.ts` wysyła tylko **paragony transakcyjne** (po realnym charge).
Marketingowych maili brak. Transakcyjne formalnie nie wymagają unsubscribe (CAN-SPAM §7(2),
GDPR art. 6(1)(b)/(f) — słuszny interes), ALE: potrzebny **nadawca z danymi identyfikacyjnymi**
(zwł. przy domenie .pl i Służby konsumenckiej UE) i dobra praktyka = wyraźna stopka + opt-out
od wszystkiego poza transakcyjnymi.

Plan (runda 6):
- Env: `BUSINESS_NAME`, `BUSINESS_ADDRESS` (adres korespondencyjny — **do uzupełnienia przez
  właściciela**), `SUPPORT_EMAIL` (fallback `SMTP_FROM`).
- Stopka każdego maila: nadawca + adres pocztowy + „Transactional message about your payment —
  no marketing." + kontakt supportu. Brak `List-Unsubscribe` dla transakcyjnych (poprawnie),
  ale gotowy mechanizm `MAIL_OPT_OUT` (klucz w Redis po adresie) — jeśli kiedykolwiek
  dojdzie marketing, odmowa = twarde pomijanie.
- README: sekcja compliance.

## 5. Warunki odnowienia przy przycisku Subscribe — **BRAK → dodajemy**

Stan: przycisk „Subscribe (1-Click)" bez widocznych warunków odnowienia. Wymogi:
**FTC ROSCA** (US): jasne ujawnienie przed zakupem (kwota, częstotliwość, że odnawia automatycznie,
jak anulować) + świadoma zgoda; **EU 2011/83/UE**: informacje przedumowne. Robimy pełne ujawnienie
przy każdym punkcie zakupu.

Plan (runda 6):
- `PlanCard.svelte`: pod przyciskiem drobny druk (EN+PL): „Auto-renews every {period} at {amount}
  until cancelled. Cancel anytime in My subscriptions — revoking the delegate stops billing instantly."
  + link „Renewal terms" → /legal#renewals.
- `SubscriptionModal`: sekcja „What you sign" rozwinięta o warunki odnowienia + kwotę + częstotliwość.
- `/pay` (one-time): jasno „One-time payment — no recurring charges" (odwrócona informacja, też wymagana).
- Nowa strona **/legal**: Renewal & cancellation terms (ROSCA-style), Acceptable use, DMCA,
  contact point (DSA), privacy note (no trackers, fonts self-hosted, co przechowujemy: sygnatury,
  kwoty, metadane faktur). Statyczna (prerender), link w stopce.

## 6. DMCA — rejestracja agenta krok po kroku (walkthrough)

Dlaczego: RustFS + proxy `/media/*` = **hosting treści użytkowników** (merchant może wgrywać loga).
Jako operator jesteś „service provider" w sensie DMCA 512(c) (US) i hostingiem w sensie DSA (UE).

### Krok po kroku (US Copyright Office, DMCA Designated Agent Directory)

1. **Konto**: https://dmca.directory.gov/account → „Register" (e-mail + hasło; weryfikacja mailem).
2. **Opłata**: 6 USD za rejestrację jednego service provider-a (karta). Odnowienie co **3 lata**
   (system wysyła przypomnienia na maila agenta — nie zgub).
3. **Dodaj service provider** („Designate an agent"):
   - Service Provider Name: `solhack.rafal.si` (plus alternate names: `OnchainSUB`, `solhack`);
   - Alternative Names (opcjonalne): nazwa marki;
   - **Designated Agent**: imię i nazwisko, title (np. „Operator"), adres pocztowy, e-mail
     (użyj dedykowanego: `dmca@2b2t.pl` — załóż alias w Protonie), telefon;
   - **Full Address of Service Provider**: URL serwisu + adres korespondencyjny.
4. **Zapłać 6 USD** → status „Active". Rejestr jest publiczny (searchable directory).
5. **Opublikuj politykę DMCA** na stronie (wymóg 512(c)(2)): nasza `https://solhack.rafal.si/legal#dmca`
   (strona /legal z rundy 6) zawiera:
   - dane designated agent (zgodne z rejestrem),
   - elementy prawidłowego zgłoszenia 512(c)(3): podpis, identyfikacja utworu, URL naruszenia,
     dane kontaktowe, oświadczenie dobrej wiary, oświadczenie pod rygorem perjury,
   - counter-notice (procedura przywrócenia, 10-14 dni roboczych),
   - repeat-infringer policy (np. 3 trafne zgłoszenia → ban konta merchanta),
   - SLA: odpowiadamy w 2 dni robocze, takedown do 48h.

### UE — DSA (uzupełniające, ważne przy domenie .pl)

Jako hosting service masz pod DSA: **punkt kontaktowy** (e-mail — podany w /legal),
**mechanizm notice-and-action** (nasz formularz DMCA pokrywa DMCA; DSA wymaga też zgłoszeń
treści nielegalnych nie-DMCA — dodajemy drugą opcję w formularzu: „illegal content report"),
oraz **T&C**. Pełne obowiązki (KPI/raporty) dotyczą dużych platform — mikro/długi ogon ma lżejszy reżim.

### Checklist TL;DR

- [ ] Konto na dmca.directory.gov + zapłać 6 USD + wpisz agenta (dane wyżej)
- [ ] Strona /legal (runda 6) z polityką DMCA + contact point DSA
- [ ] Alias mailowy dmca@2b2t.pl w Protonie
- [ ] Wpis w README (Legal section)
- [ ] Kalendarz: odnowienie rejestru za 3 lata

---

## Kolejność wdrożenia (runda 6)

1. Fonty self-host + subset Material Symbols (scripts/fonts.sh) → Layout bez Google.
2. AgeGate modal + PUBLIC_AGE_GATE env.
3. Stopka maili (BUSINESS_NAME/ADDRESS/SUPPORT_EMAIL) + MAIL_OPT_OUT.
4. Warunki odnowienia: PlanCard + SubscriptionModal + /pay one-time.
5. Strona /legal (prerender): renewals, DMCA, DSA contact point, privacy note.
6. Nagłówki bezpieczeństwa (CSP bez łamania iframe embedów, XCTO, Referrer-Policy).
7. README compliance section.

## Sekrety/wartości do uzupełnienia przez właściciela

- `BUSINESS_NAME`, `BUSINESS_ADDRESS` — prawdziwe dane korespondencyjne (wymóg UE/US w mailach i /legal).
- Decyzja: czy serwis obsługuje tylko zdemokratyzowany devnet demo (wtedy gate/ToS mogą być
  „demo mode" oznaczone) — po mainnet obowiązki rosną (regulamin płatności, AML nie dotyczy
  operatora bramki bez custody, ale ToS tak).
