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
| F08 | React/Tailwind/shadcn, Router, Query | 2 | F02 | PARTIAL: build i theme; wizualna inspekcja zablokowana |
| F09 | Rejestracja/logowanie i portfel UI | 2 | F06,F08 | PARTIAL: E2E w CI PASS i użytkownik potwierdził konto/portfel; wizualna inspekcja mobile/dark mode pozostaje |
| F10 | Vitest unit + PostgreSQL integration | 2 | F06,F07 | DONE: 4 unit i8 integration PASS |
| F11 | Playwright i CI | 2 | F09,F10 | DONE: GitHub Actions PASS, Chromium E2E 1/1 (15.11.2026) |
| F12 | OpenAPI i contract tests | 2 | F07 | DONE: OpenAPI z Zod, endpoint i artefakt JSON, kontrola aktualności CI oraz testy odpowiedzi |
| P01 | Decimal i operacje domain | 2 | F01 | DONE: FinancialDecimal precision40/HALF_EVEN, guardy i jawne zaokrąglenia; 16 testów arytmetyki |
| P02 | BUY/SELL koszt i prowizja | 3 | P01 | TODO: golden cases1/2 |
| P03 | Gotówka, wpłaty, wypłaty, FX | 3 | P02 | TODO: golden case3 + salda |
| P04 | Wycena, kompletność, P/L | 3 | P03 | TODO: stale/missing/future |
| P05 | Symulator oba źródła środków | 3 | P04 | TODO: case4, brak skutków ubocznych |
| P06 | Koncentracja i stress | 2 | P04 | TODO: case5, unknown buckets |
| P07 | Testy regresji i granic | 3 | P02–06 | TODO: case6/7, ułamki i zero |
| A01 | Migracje instrument/ledger/FK/check | 2 | P01,F04 | TODO: cross-tenant FK reject |
| A02 | Instrument i ręczne quote/FX API | 2 | A01 | TODO: owner scope |
| A03 | Operacje API i blokada salda | 3 | P03,A01 | TODO: concurrent BUY nie wydaje dwa razy |
| A04 | Formularze operacji i historia | 3 | A03,F09 | TODO: walidacja/empty/error |
| A05 | Dashboard i pozycje | 3 | P04,A04 | TODO: brak sztucznych danych |
| A06 | Symulator UI/API | 3 | P05,A05 | TODO: assumptions + before/after |
| A07 | Ryzyko UI i ustawienia | 2 | P06,A05 | TODO: progi i scenariusze |
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

Najbliższy punkt kontynuacji: P02, potem P03–P07; osobno domknąć wizualną inspekcję F08–F09. Etap3 nie zaczyna się od dashboardu z fikcyjnymi danymi. V2 źródła automatyczne i płatności celowo bez zadań implementacyjnych.

Aktualizacja środowiska macOS 15.11.2026: build/typecheck/4 unit PASS na Node 24. Docker CLI dostępny, daemon wyłączony; F03/F08/F09 zachowują status PARTIAL; F11 zamknięte po przejściu CI. Utworzono publiczne repozytorium `nookieslaya/investorkit`; pierwszy przebieg CI PASS: build/typecheck, migracja, 4 unit, 8 integration, 1 E2E w Chromium.

F12 ukończone 15.11.2026: dokumentacja wyłącznie wdrożonych operacji własnych; Better Auth poza zakresem. Testy JSON Schema odpowiedzi uruchamiane na dedykowanej bazie `investorkit_contract_test`. F03 zamknięte po lokalnym uruchomieniu Compose i migracji; użytkownik potwierdził rejestrację/logowanie i utworzenie portfela.
