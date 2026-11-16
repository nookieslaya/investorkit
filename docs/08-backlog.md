# Backlog i plan małych zadań
Statusy: TODO / DONE / BLOCKED / PARTIAL. Estymaty to godziny pracy implementacyjnej bez nauki i oczekiwania na feedback. Nie są zobowiązaniem terminu. Definicja DONE: kryteria spełnione, odpowiednie testy uruchomione, README zaktualizowane, brak sekretów. Kolejność wierszy jest kolejnością wdrażania; zależności wskazane jawnie.

| ID | Zadanie | h | Zależność | Status / akceptacja |
|---|---|---:|---|---|
| S01 | Specyfikacja i kryteria US | 2 | — | DONE: docs01 |
| S02 | Architektura, model, API i matematyka | 4 | S01 | DONE: docs02–06 |
| S03 | Walidacja biznesowa i rejestr ryzyk | 2 | S01 | DONE: docs07/09 |
| F01 | npm workspaces, strict TS, Node24 | 1 | S02 | DONE: strict typecheck przechodzi |
| F02 | Dokładne wersje i lockfile | 1 | F01 | DONE: exact versions + package-lock.json |
| F03 | Compose PostgreSQL i env validation | 1 | F01 | DONE: lokalny Compose PostgreSQL17 healthy, env i migracja PASS (15.11.2026) |
| F04 | Auth schema i migracja | 2 | F02,F03 | DONE: migrate na prawdziwym PostgreSQL17 |
| F05 | Better Auth + cookies + handler | 2 | F04 | DONE: signup/login/logout integration |
| F06 | Owner scoped portfolio repo | 2 | F05 | DONE: owner isolation i concurrent limit integration |
| F07 | Rate limit, origin guard, errors, log redaction | 2 | F05 | DONE: origin/errors/size/HTTP429 integration |
| F08 | React/Tailwind/shadcn, Router, Query | 2 | F02 | DONE: build/theme, desktop/mobile/dark i inspekcja zrzutów inwestycji/gotówki |
| F09 | Rejestracja/logowanie i portfel UI | 2 | F06,F08 | DONE: E2E i użytkownik potwierdzili rejestrację/logowanie/portfel |
| F10 | Vitest unit + PostgreSQL integration | 2 | F06,F07 | DONE: aktualnie107 unit i40 integration PASS |
| F11 | Playwright i CI | 2 | F09,F10 | DONE: GitHub Actions PASS, Chromium E2E 1/1 (15.11.2026) |
| F12 | OpenAPI i contract tests | 2 | F07 | DONE: OpenAPI z Zod, endpoint i artefakt JSON, kontrola aktualności CI oraz testy odpowiedzi |
| F13 | Select shadcn/ui w formularzach | — | F08 | DONE: 7 pól, strzałki z odstępem16px, stylizowana lista, motywy i klawiatura |
| P01 | Decimal i operacje domain | 2 | F01 | DONE: FinancialDecimal precision40/HALF_EVEN, guardy i jawne zaokrąglenia; 16 testów arytmetyki |
| P02 | BUY/SELL koszt i prowizja | 3 | P01 | DONE: lokalny koszt BUY/SELL, prowizje, średnia, oversell i pełne zamknięcie; golden cases1/2 kosztu PASS |
| P03 | Gotówka, wpłaty, wypłaty, FX | 3 | P02 | DONE: replay sald, wpłaty/wypłaty, FX12, historyczny koszt PLN i golden3 kosztu; gotówka API/UI |
| P04 | Wycena, kompletność, P/L | 3 | P03 | DONE: wycena z gotówką, P/L, percent/null, subtotal, daty/źródła i stale/missing/future |
| P05 | Symulator oba źródła środków | 3 | P04 | DONE: case4, oba źródła, fee/reszta, FX i brak zapisów |
| P06 | Koncentracja i stress | 2 | P04 | DONE: case5, Top3/5 z gotówką, UNKNOWN, spadki0–100% i jawna niepełność |
| P07 | Testy regresji i granic | 3 | P02–06 | TODO: case6/7, ułamki i zero |
| A01 | Migracje instrument/ledger/FK/check | 2 | P01,F04 | DONE: wspólny ledger4 typów, instrument/quote/FX, composite owner/currency FK i CHECK |
| A02 | Instrument i ręczne quote/FX API | 2 | A01 | DONE: instrumenty i ręczne quote/FX z owner scope i walidacją dat/walut |
| A03 | Operacje API i blokada salda | 3 | P03,A01 | DONE: wspólny replay, blokada/idempotencja, concurrent BUY/SELL/withdrawal i operacje wsteczne PASS |
| A04 | Formularze operacji i historia | 3 | A03,F09 | DONE: wpłaty/wypłaty, BUY/SELL, historia i stany walidacji/loading/error/empty |
| A05 | Dashboard i pozycje | 3 | P04,A04 | DONE: rzeczywiste wartości/P&L, pozycje i niepełna wycena; bez danych demonstracyjnych |
| A06 | Symulator UI/API | 3 | P05,A05 | DONE: formularz shadcn, assumptions + before/after, read-only API |
| A07 | Ryzyko UI i ustawienia | 2 | P06,A05 | DONE: osobny widok Ryzyko, progi/świeżość z revision/If-Match, scenariusze i źródła |
| A08 | Dziennik CRUD | 3 | A02,F09 | TODO: prywatność, revision |
| A09 | Snapshot history | 2 | A05 | TODO: luki danych jawne |
| I01 | Kontrakt parsera i blokada XTB | 1 | S02 | PARTIAL: availability contract i SAMPLE_REQUIRED; parser DTO przed I03 |
| I02 | Zanonimizowana próbka XTB | — | użytkownik | BLOCKED: brak pliku |
| I03 | CSV preview/mapowanie | 3 | I01 | TODO: quoting, encoding, limit |
| I04 | Zweryfikowany adapter XTB | 3 | I02,I03 | BLOCKED: format, waluty, fees |
| I05 | Receipt dedup i atomowy commit | 3 | I04,A03 | TODO: powtórny/równoległy import |
| R01 | Prywatny upload i ekstrakcja PDF | 4 | F07 | TODO: limits/timeout/magic bytes |
| R02 | Bezpieczny URL fetcher | 4 | R01 | TODO: SSRF/redirect/DNS tests |
| R03 | Jobs PostgreSQL i ACL/cache scope | 3 | R01 | TODO: dedupe, leases, private/public |
| R04 | Budżet i provider OpenAI | 3 | R03 | TODO: reserve/settle, UNKNOWN usage |
| R05 | Weryfikacja cytatów/output Zod | 3 | R04 | TODO: fabricated citation reject |
| R06 | Historia i UI raportów | 3 | R05 | TODO: fact vs interpretation |
| B01 | 10–15 wywiadów | — | S03 | TODO: dowody problemu |
| B02 | Landing z formularzem | 3 | F08 | TODO: jasny status produktu |
| B03 | Pilot i pomiar kohort | — | A05–08 | TODO: metryki z docs07 |
| B04 | Mail verify/reset/double opt-in | 3 | F05,B02 | TODO: single-use/expired tokens |
| B05 | Export/delete i retencja | 3 | A08,R06 | TODO: usuwanie blobów, DB i jobów |
| B06 | Backup + restore drill + audyt dostępności | 3 | B05 | TODO: przed publicznym pilotem |
| B07 | Decyzja o płatnym pilotażu | 1 | B03 | TODO: dopiero wtedy backlog billing |

Najbliższy punkt kontynuacji: P07, następnie A08; osobno domknąć wizualną inspekcję F08–F09. Etap3 nie zaczyna się od dashboardu z fikcyjnymi danymi. V2 źródła automatyczne i płatności celowo bez zadań implementacyjnych.

Aktualizacja środowiska macOS 15.11.2026: build/typecheck/4 unit PASS na Node 24. Docker CLI dostępny, daemon wyłączony; F03/F08/F09 zachowują status PARTIAL; F11 zamknięte po przejściu CI. Utworzono publiczne repozytorium `nookieslaya/investorkit`; pierwszy przebieg CI PASS: build/typecheck, migracja, 4 unit, 8 integration, 1 E2E w Chromium.

F12 ukończone 15.11.2026: dokumentacja wyłącznie wdrożonych operacji własnych; Better Auth poza zakresem. Testy JSON Schema odpowiedzi uruchamiane na dedykowanej bazie `investorkit_contract_test`. F03 zamknięte po lokalnym uruchomieniu Compose i migracji; użytkownik potwierdził rejestrację/logowanie i utworzenie portfela.

P02 ukończone 15.11.2026: 28 testów pozycji (łącznie51 unit); wynik i koszt są w walucie instrumentu. Gotówka, historyczny koszt PLN i FX pozostają w P03. Referencyjne unrealized58 z case2 jest sprawdzone arytmetycznie, bez deklarowania wdrożonej wyceny (P04). Brak nowych endpointów i migracji.

P03 (15.11.2026) rozszerzone na prośbę użytkownika o widoczny fragment API/UI: salda3 walut, historyczne wpłaty netto, formularz wpłaty/wypłaty i historia. A01/A03/A04 częściowo przesunięte do przodu wyłącznie dla gotówki. BUY/SELL pozostaje w czystym silniku. Migracja0001 przejrzana i zastosowana w środowisku użytkownika po lokalnej kopii bazy; bez dodawania testowych operacji do jego portfela. E2E i integracja pracują na osobnej bazie i portach.

P04 (15.11.2026): na prośbę użytkownika domknięto też pionowy zakres A01–A05 ręcznego MVP. Tabela cash_operations jest jednym ledgerem4 typów; dotychczasowe ID i klucze ponowień zachowane. Symulator, risk settings, korekty/edycja, paginacja i snapshoty pozostają poza tym etapem. Obecne ceny/kursy są manualne; progi świeżości API=72h, konfigurowalne argumenty w silniku (ustawienia UI później w A07).

Poprawka UI przed P05: wszystkie natywne selecty formularzy zastąpiono shadcn/ui Select na Radix2.4.1. Brak zmian API, obliczeń i danych. Następny etap nadal P05/A06.

P05/A06 ukończone16.11.2026: symulator bez zapisów, budżet z prowizją, ilość zaokrąglana w dół, reszta gotówkowa, oba źródła środków i porównanie z pełnym portfelem. Aktualny FX z ręcznych danych; cena scenariusza jako jawna referencja wyłącznie nowej pozycji bez notowań. Braki/stare dane nie są maskowane. Bez migracji i nowych zależności. Następny etap P06/A07: koncentracja/stress i ustawienia progów.

Doprecyzowanie A06 (16.11.2026) DONE: dopłata oddzielona od wyniku zakupu i P/L całego portfela, komunikat o różnicy cen, rozliczenie wartości przed/po. Regresja przykładu użytkownika80+1000/zakup100/referencja70. Metryki przepływu i wyniku wydzielone zgodnie z rozróżnieniem kosztu, market value i P/L w Portfolio Performance/Sharesight; bez deklaracji identycznych metod zwrotu czy modeli kosztowych.

Uproszczenie A06 (16.11.2026) DONE:4 główne wyniki, szczegóły na żądanie, automatyczna cena referencyjna bez nadpisywania własnego wpisu, formatowanie pieniędzy/ilości/średniej i jawna reszta<grosza. Symulator oddzielony od Operacji, dane i funkcje gotówki zachowane. Silnik i istniejące16 kontraktów bez zmian; konieczny dodatkowy GET cen do podpowiedzi nieposiadanych instrumentów. Bez bibliotek/migracji. Usunięte pozostałości poprzedniego układu. Lokalnie93 unit/32 integration/2 E2E, build/typecheck i4 warianty widoku PASS.

P06/A07 ukończone16.11.2026: czysta koncentracja i stress, widok Ryzyko, ustawienia progów/świeżości stosowane przez wszystkie odczyty finansowe, migracja0003 bez zmian historii. Golden5 i granice0/100%, gotówka stała, UNKNOWN w mianowniku, brak fałszywych udziałów przy niepełności. Zapis ustawień owner-scoped z blokadą i revision/If-Match, konflikt409. Lokalnie105 unit,40 integration i3 E2E PASS. P07 pozostaje osobnym przeglądem regresji; potem dziennik A08.

Uproszczenie A07 (16.11.2026) DONE: podsumowanie wpływu na cały portfel, podpisane zmiany, porównanie wybranej pozycji, zbiorczy wynik wszystkich papierów, szczegóły na żądanie i presety10/20/40%. Neutralne0%, braki bez zer, ostrzeżenia poza panelami. Reset po edycji/refetch także przy identycznych danych i późnej odpowiedzi; stare hashe z nowymi etykietami nawigacji. Bez zmian silnika/API, zależności i migracji; usunięto dawny renderer wyniku i zbędne style.107 unit/40 integration/3 E2E, typecheck/build/OpenAPI, noUnused i4 warianty wizualne PASS. P07 nadal osobnym etapem.

Poprawka historii gotówki (16.11.2026) DONE: subtelny scrollbar, stabilny gutter i odstęp, osobna kolumna kwoty bez łamania, na mobile kwota pod opisem. Dostępny focus i przewijanie klawiaturą. Bez zmian danych/API i zależności; P07 nadal następny.
