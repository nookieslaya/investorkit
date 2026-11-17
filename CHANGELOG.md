# Historia prac

## 0.1.0 — 2026-11-15

### Dokumentacja i decyzje
- Specyfikacja MVP, user stories i kryteria akceptacji; etapowanie MVP-A/MVP-B.
- Modularny monolit i sześć pakietów/katalogów zgodnie z briefem; rejestr decyzji i ryzyk.
- Docelowy model danych oraz API z owner scope, idempotencją i decimal strings.
- Semantyka wyniku, FX, prowizji, częściowej sprzedaży, ułamków, symulatora i brakujących wycen.
- Plan importu XTB z blokadą do próbki, bezpiecznego PDF/URL, analizy AI, cache i budżetów.
- Przegląd konkurencji na podstawie źródeł pierwotnych i plan walidacji popytu; bez deklarowania potwierdzonej gotowości do zapłaty.
- Backlog małych zadań, raport weryfikacji i instrukcje kontynuacji.

### Foundation
- npm workspaces, Node24, strict TypeScript, dokładne wersje i lockfile.
- Compose PostgreSQL17; Drizzle schema i pierwsza migracja auth + portfolios.
- Better Auth i Fastify: konto/sesja/logowanie/wylogowanie, origin guard, rate limiting, bezpieczne błędy i zredagowane logi.
- Repozytorium portfeli ograniczające zapytania do właściciela; unique owner zabezpiecza równoczesne tworzenie dwóch portfeli.
- React/Vite/Tailwind, Router/Query, Button w konwencji shadcn; polskie formularze konta i portfela, motywy, puste stany i komunikaty błędów.
- Kontrakty Zod, zablokowany kontrakt dostępności adaptera XTB, szkielety engine.
- Vitest unit/integration, scenariusz Playwright i workflow GitHub Actions.
- Test429 wykrył błąd kolejności instalacji pluginu rate-limit; poprawiono inicjalizację i potwierdzono rzeczywiste ograniczanie żądań.

### Potwierdzone i ograniczenia
- Typecheck i build przechodzą; 4 unit +8 integration na rzeczywistym PostgreSQL17.
- E2E nie przeszedł do testowania UI: środowisko odmawia socketu Chromium. CI i Compose nie były uruchomione.
- Silnik finansowy, operacje i analizy nie są wdrożone. Nie wykonano płatności, integracji AI ani automatycznego pobierania raportów.
- Szczegóły: docs/VERIFICATION.md. Nie traktować tej wersji jako gotowego publicznego SaaS.

### Publikacja GitHub — 15.11.2026
- Odtworzono historię Git z bundle i opublikowano publiczne repozytorium https://github.com/nookieslaya/investorkit.
- Dodano ignorowanie `.DS_Store`; lokalny build/typecheck/4 unit PASS na Node 24.
- Pierwszy CI PASS: migracja PostgreSQL17, build/typecheck, 4 unit, 8 integration, 1 Chromium E2E. F11 zamknięte; lokalny Compose i wizualna inspekcja UI pozostają do wykonania.

### F12 — OpenAPI i kontrakty, 15.11.2026
- OpenAPI 3.0.3 generowane natywnie z Zod dla wdrożonych endpointów własnych; publiczny endpoint dokumentacji i wersjonowany JSON.
- Kontrola aktualności w CI i testy rzeczywistych odpowiedzi względem JSON Schema, w tym izolacja właściciela i błędy; bez nowych zależności.
- Lokalny Compose i migracja potwierdzone, użytkownik sprawdził konto/portfel; F03 DONE. Następny etap: P01.

### P01 — podstawa arytmetyki finansowej, 15.11.2026
- `FinancialDecimal` z prywatnym kontekstem decimal.js, precision40 i HALF_EVEN; brak obliczeń kwot jako number.
- Walidacja kwot, ilości, cen i prowizji; jawny floor, granice prezentacji/zapisu, overflow i diagnostyka procentu przy niedodatniej bazie.
- 16 testów precyzji, granic i izolacji konfiguracji. Brak nowych zależności i zmian API/UI/DB. BUY/SELL pozostaje w P02.

### P02 — BUY/SELL i koszt pozycji, 15.11.2026
- Niemutowalny stan pozycji: koszt lokalny, średnia i wynik sprzedaży po prowizji, proporcjonalna alokacja i pełne zamknięcie bez resztek.
- Zod DTO dla instrumentu/transakcji, kontrola jednostki walutowej prowizji, skali i oversell. Wspólny decimalSchema odrzuca końcowe nowe linie.
- 28 testów pozycji, golden cases1/2 kosztu; brak nowych endpointów i migracji. Salda, historyczny koszt PLN i FX pozostają w P03.

### P03 i widoczny panel gotówki — 15.11.2026
- Deterministyczny replay chronologiczny, trzy subkonta, historyczne wpłaty netto i koszt PLN/FX12, walidacja każdego stanu po operacjach wstecznych.
- Na prośbę użytkownika pionowy zakres gotówki: migracja z composite FK/CHECK, API odczytu/zapisu z blokadą portfela i idempotencją, salda/formularz/historia w UI. BUY/SELL w API/UI nadal niewdrożone.
- Migracja lokalna po kopii bazy; konto i portfel zachowane, bez wstawiania danych demonstracyjnych do jego historii. Testy na osobnej bazie i portach.
- Rozszerzone E2E wpłat/wypłat/FX i zrzuty desktop/mobile/dark; OpenAPI obejmuje8 operacji.

### P04 i działające inwestycje — 15.11.2026
- Wycena papierów i gotówki, nominalny P/L/prosta stopa, kompletność i subtotal, źródła/datowanie, braki/stale/future; obliczenia ze stanu niezaokrąglonego do zapisu.
- Domknięte A01–A05 ręcznego MVP: instrumenty, wspólny ledger BUY/SELL/wpłat/wypłat z blokadą/idempotencją i replay, ręczne ceny/FX, dashboard/pozycje/formularze/historia.
- Migracja0002 po kopii bazy zachowuje operacje i hashe P03, dodaje composite owner/currency FK i CHECK. Ceny≥0, waluty i daty jawne. Bez danych demonstracyjnych w portfelu użytkownika.
- Responsywne karty mobilne, tabela desktop, ciemny motyw, ścisłe OpenAPI15 operacji i pełny scenariusz E2E od brakującej/starej ceny do wyceny i częściowej sprzedaży.

### Poprawa selectów — 15.11.2026
- Wszystkie natywne pola wyboru zamienione na Select shadcn/ui/Radix: spójna lista, strzałka odsunięta16px od krawędzi, zaznaczenie i stany focus/disabled.
- Motywy zachowane także w portalu, długie etykiety obsługiwane bez rozpychania formularzy; klawiatura i FormData zweryfikowane w E2E.
- Bez zmian API, silnika i danych. P05 pozostaje następnym etapem.

### P07 — regresje i granice silnika — 17.11.2026
- Mapa pokrycia golden1–7 i17 nowych testów jednostkowych, w tym18 kombinacji waluty, finansowania i precyzji ilości.
- Dwa nowe testy PostgreSQL legalnych identycznych zakupów, idempotencji i braku zmian po odrzuconych zapisach.
- Pokryte przekrojowo koszty i P/L, zerowe/ujemne wkłady, ułamki poniżej skali zapisu, pełne wyjście, overflow i świeżość FX. Silnik/API/UI bez zmian, brak nowych zależności i migracji. Następny etap A08.

### A08 — prywatny dziennik decyzji — 17.11.2026
- Nowy #journal: uzasadnienie, teza, horyzont, ryzyka, warunki przeglądu i notatki dla portfela lub instrumentu. Plain text, edycja/usuwanie z potwierdzeniem i ochroną If-Match/revision; zachowanie szkicu przy konflikcie.
-4 endpointy i migracja0004 z composite FK oraz kontrolą długości/revision. Limit100 wpisów, bez zmian finansów i21 istniejących kontraktów API; bez nowych zależności.
-125 unit,49 integration,4 E2E oraz desktop/mobile/light/dark zweryfikowane. Następny etap A09.
