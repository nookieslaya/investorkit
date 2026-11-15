# Weryfikacja — 15.11.2026

| Kontrola | Wynik | Zakres |
|---|---|---|
| Odczyt npm registry | PASS | Aktualne dist-tags.latest i engines zapisane w registry-versions.json |
| npm ci --ignore-scripts | PASS | Lockfile odtworzony bez zmian; brak wykonania lifecycle scripts w tej kontroli |
| npm install | PASS | 253 pakiety, dokładne wersje i lockfile; initial install --ignore-scripts |
| Build pakietów/API/web | PASS | TypeScript i produkcyjny build Vite |
| Typecheck aplikacji/pakietów/testów | PASS | Strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes |
| Unit | PASS | 4 testy granic DTO, decimal i konfiguracji, brak mapowania XTB |
| Migracja | PASS | Pusta prawdziwa baza PostgreSQL17.11; ponowne uruchomienie bez błędu |
| Integration | PASS | 8 testów: auth, izolacja właścicieli, concurrent create, origin, input/size, cookies, logout, HTTP429 i readiness503 |
| Playwright E2E | BLOCKED | Uruchomienie Chromium przerwane przed pierwszą akcją: socket() Operation not permitted; pobranie bundlowanego Chromium także nieudane |
| Wizualna inspekcja UI w przeglądarce | NOT RUN | Brak działającego Chromium w tym środowisku; build nie potwierdza wyglądu ani WCAG |
| GitHub Actions | NOT RUN | Workflow przygotowany, brak repozytorium zdalnego |
| Docker Compose | NOT RUN | Docker CLI niedostępny; do integracji użyto tymczasowych binariów PostgreSQL, poza zależnościami projektu |
| npm audit --omit=dev | REVIEW | 4 moderate w ścieżce drizzle-kit → esm-loader/core-utils → esbuild<=0.24.2; brak high/critical w tym odczycie; nie stosowano force downgrade |

Pakiet testowy binariów PostgreSQL pochodził z @embedded-postgres/linux-x6417.11.0-beta.19 i nie jest zależnością aplikacji. To rzeczywisty PostgreSQL, nie emulator. W produkcie pozostaje Compose postgres17-alpine. Numer beta dotyczy wrappera dystrybucji.
Advisory esbuild: https://github.com/advisories/GHSA-67mh-4wv8-2f99. Dotyczy developerskiego serwera esbuild; nie uruchamiamy go publicznie. Przed kolejną aktualizacją drizzle-kit sprawdzić naprawę upstream. Nie wymuszać automatycznie łamiącego downgrade wskazanego przez npm audit.
Nie wykonano: testów matematyki (silnik niewdrożony), importu XTB (brak próbki), analizy AI (brak integracji), restore i audytu dostępności. Nie deklarujemy pełnego bezpieczeństwa ani zgodności WCAG.

## Ponowna weryfikacja lokalna — macOS, 15.11.2026

- Odtworzono pełną historię z `investorkit.bundle`; `git bundle verify` i `git fsck --full` PASS. Pliki źródłowe były zgodne z commitem `0f2f662`.
- Node 24.22.3; `npm ci`, `npm run build`, `npm run typecheck` i `npm test` PASS (4 testy jednostkowe). Lockfile bez zmian.
- Docker CLI jest dostępny, ale daemon nie działa. W tej sesji nie uruchomiono migracji, testów integracyjnych ani E2E; wcześniejsze wyniki powyżej pozostają historyczne.
- Po potwierdzeniu braku repozytorium utworzono publiczne https://github.com/nookieslaya/investorkit za zgodą właściciela. Pierwszy CI dla commita `b71f14b` zakończył się sukcesem.

## GitHub Actions — 15.11.2026

[Przebieg CI](https://github.com/nookieslaya/investorkit/actions/runs/43749258894) dla `b71f14b`: PASS. Node 24, PostgreSQL17 w izolowanym kontenerze GitHub Actions; instalacja zależności, build, typecheck, migracja, 4 testy unit, 8 integration i 1 Playwright E2E w Chromium. F11 DONE. Historyczna lokalna blokada Chromium nie dotyczy tego przebiegu. F03 nadal PARTIAL (lokalny Compose), F08/F09 nadal PARTIAL (brak wizualnej inspekcji desktop/mobile/dark mode).

## F12 i uruchomienie lokalne — 15.11.2026

- Lokalny Compose: PostgreSQL17 healthy, migracja PASS. Użytkownik potwierdził rejestrację, logowanie i stworzenie portfela. F03 DONE. Wizualna inspekcja mobile/dark mode nadal niewykonana.
- F12: build, typecheck, 7 unit i 10 integration PASS na Node24. Integracja korzystała wyłącznie z nowej, migrowanej bazy `investorkit_contract_test`; dane lokalnego portfela użytkownika poza testami.
- Sprawdzono wygenerowany OpenAPI, jego aktualność oraz odpowiedzi JSON API: 200/201, 400, 401, 403, 404, 409, 413, 415, 429, 500 i503. Testy walidatora wykrywają brak pól, nieprawidłowe UUID/daty/waluty i dodatkowe pola prywatne.
- `npm run openapi:check` PASS; lokalny `/api/v1/openapi.json` dostępny przez proxy Vite. Brak nowych zależności; lockfile bez zmian. Better Auth pozostaje poza wygenerowanym dokumentem.
- E2E lokalnie w tej zmianie nieuruchamiane, aby nie używać bazy i aktywnej sesji użytkownika. Pełny przebieg weryfikuje GitHub Actions.

F12 GitHub Actions dla `079da72`: [przebieg](https://github.com/nookieslaya/investorkit/actions/runs/43750687345) PASS — instalacja, generowane kontrakty, build/typecheck, migracja, 7 unit, 10 integration i1 E2E Chromium. Bez nowych błędów.

## P01 — 15.11.2026

- Node24: build, typecheck, 23 unit i kontrola aktualności OpenAPI PASS; 16 testów dotyczy nowej arytmetyki. decimal.js10.6.0 było już zależnością pakietu, lockfile bez zmian.
- Sprawdzone: ułamki, kwoty większe niż Number.MAX_SAFE_INTEGER, precision40, brak zaokrągleń do skali zapisu po drodze, HALF_EVEN dodatnie/ujemne, usuwanie ujemnego zera, floor i skala ilości0–10, niedodatnia baza procentu, dzielenie przez zero, overflow po zaokrągleniu oraz izolacja od globalnego Decimal.set.
- Guardy odrzucają number, bigint, obiekty, NaN/Infinity, exponent, spacje/nowe linie, nadmiarowe cyfry i niedozwolone wartości domenowe.
- P01 nie dodaje endpointów, migracji ani zmian UI; lokalna baza użytkownika nie jest używana przez testy. BUY/SELL, FX, wyceny i golden cases1–7 pozostają do P02–P07. GitHub Actions dla `d291a1a`: [przebieg](https://github.com/nookieslaya/investorkit/actions/runs/43751311427) PASS — build/typecheck, OpenAPI, migracja, 23 unit, 10 integration i1 E2E Chromium.

## P02 — 15.11.2026

- Node24: build, typecheck, 51 unit i aktualność OpenAPI PASS. Dodano28 testów pozycji: golden1/2 kosztu, częściowa i całkowita sprzedaż, ponowny BUY, ułamki, niezaokrąglona alokacja kosztu, końcowy remainder, prowizje, straty, immutability, różne waluty/instrumenty, oversell i błędne DTO.
- Dodatkowa poprawka wspólnego decimalSchema odrzuca końcowe nowe linie, które JavaScript `$` sam dopuszcza. Regresja w testach kontraktów. Brak zmiany dokumentowanych endpointów/OpenAPI.
- Lockfile zmieniony wyłącznie o wewnętrzne workspace engine→shared; bez nowych bibliotek zewnętrznych.
- P02 liczy lokalny koszt i wynik sprzedaży, bez sald, historycznego FX/kosztu PLN, wycen i API/UI. Dane lokalnego użytkownika nie były użyte do testów. GitHub Actions dla `0658e15`: [przebieg](https://github.com/nookieslaya/investorkit/actions/runs/43752114594) PASS — build/typecheck, OpenAPI, migracja, 51 unit, 10 integration i1 E2E Chromium.

## P03 + API/UI gotówki — 15.11.2026
- Wygenerowana i przejrzana migracja0001: wyłącznie CREATE cash_operations, FK, indeksy, CHECK; bez DROP/UPDATE istniejących danych. Migracja PASS na investorkit_contract_test i bazie lokalnej aplikacji; przed lokalną migracją prywatny pg_dump w ignorowanym .local-backups. Konto i portfel zachowane; bez danych testowych w historii użytkownika.
- Lokalnie build/typecheck, 61 unit, 17 integration oraz rozszerzony Chromium E2E PASS. Integracja i E2E wyłącznie na TEST_DATABASE_URL=investorkit_contract_test; E2E uruchamia własne porty5174/3002. Nie używa aktywnego serwera ani cookies użytkownika.
- Integracja: izolacja sesji/404, równoległe identyczne klucze, konflikt klucza, powtórka z równoważnym formatem decimal, równoległe wypłaty bez podwójnego wydania, operacja wsteczna, FX12, overflow, walidacja i bezpośrednie odrzucenie cross-tenant FK w PostgreSQL.
- Unit: golden3 kosztu bazowego, salda, historyczne FX BUY/SELL, wpłaty netto≤0, przyszły/brakujący FX, brak automatycznej wymiany, pokrycie prowizji SELL, chronologia i zamknięcie kosztu. Reguły wyceny i stale pozostają P04.
- E2E: wpłata1000PLN, wypłata150, odrzucenie wypłaty1000, wpłata10USD FX4.2, netto892PLN, trwałość po reload, logout. Zrzuty cash-desktop.png i cash-mobile-dark.png obejrzane; brak obcięć/poziomego overflow. Nie jest to pełny audyt WCAG.
- OpenAPI odświeżone (8 operacji), bez nowych bibliotek zewnętrznych; API→portfolio-engine jako zależność workspace. Build zgłasza informacyjny próg bundle>500kB (bez błędu); dzielenie kodu można wykonać przy rozbudowie kolejnych widoków.

P03 CI dla `68a1e8e`: [przebieg](https://github.com/nookieslaya/investorkit/actions/runs/43753978922) PASS — build/typecheck, OpenAPI, migracje, 61 unit, 17 integration i rozszerzony1 E2E Chromium.

## P04 + A01–A05 — 15.11.2026
- Node24: build/typecheck,74 unit,26 integration i rozszerzony1 E2E Chromium PASS. Testy w dedykowanej investorkit_contract_test, E2E osobne porty5174/3002. Konto i dane użytkownika nie były danymi testowymi.
- Migracja0002 wygenerowana/przejrzana: nowe instrumenty/ceny/FX, ALTER dotychczasowego ledgeru bez UPDATE/DELETE danych, unikalny sequence i composite tenant/currency FK, CHECK rozdziału pól. Unikalny indeks instrument_owner_currency przeniesiony przed zależne FK przed zastosowaniem migracji. Migracja PASS na testowej i lokalnej bazie, po prywatnym pg_dump w ignorowanej .local-backups.
- Unit: golden3 pełnej wyceny87.15/P&L7.15, golden7 procentnull i niepełność, stale72h/brzeg, future/wybór poprzednich cen, historiaasOf, cena0, PLNidentity, zerowe subkonta, pełne zamknięcie, brak zaokrągleń pośrednich, stabilne timestampy i formatowanie HALF_EVEN bez number.
- Integracja: legacy hash/klucze P03 (niezależna literalna próbka), jeden ledger i stare API cash po BUY/SELL, owner isolation i bezpośredni cross-tenant/currency FK reject, równoległe retry/BUY/SELL bez podwójnego wydania/oversell, wsteczna wypłata walidowana względem późniejszego BUY, quote/FXdaty/waluty i historyczna wycena.
- Wykryto i poprawiono nullable enum w wygenerowanym OAS3: enum jawnie dopuszcza null niezależnie od nullable. Testy odpowiedzi pozostały ścisłe i sprawdzają rzeczywiste API. OpenAPI15 operacji aktualne.
- E2E: dotychczasowy onboarding/gotówka, instrumentUSD, zakup0.1×80+0.5, brak wyceny, stara cena, świeża cena90, FX4.2, wartość894.10/P&L2.10, oversell odrzucony, sprzedaż0.05×100−0.1 → wartość895.78/P&L3.78/cash6.4USD i trwałość po reload. Zrzuty investments-desktop.png i investments-mobile-dark.png obejrzane; na telefonie pozycje jako karty, bez poziomego overflow.
- Bez nowych zależności projektu. Build zachowuje informacyjne ostrzeżenie bundle>500kB (nie błąd); brak pełnego audytu WCAG, importu/AI, live feeds i publicznego deployu.

P04 CI: główna zmiana `2071025` PASS (https://github.com/nookieslaya/investorkit/actions/runs/43757680608). Końcowy `d654065` ze stałą kolejnością odczytu metadanych: [przebieg](https://github.com/nookieslaya/investorkit/actions/runs/43757903165) PASS — build/typecheck, OpenAPI, migracje,74 unit,26 integration i1 E2E.

Środowisko hosta: systemowy Node26 miał brakującą bibliotekę dynamiczną; reinstalacja Homebrew przywróciła go w wersji26.13.1. Projekt i testy nadal używają Node24.22.3. Zależności projektu/lockfile bez aktualizacji wersji.

## Select shadcn/ui — 15.11.2026
- Nowa zależność @radix-ui/react-select2.4.1 uzasadniona żądaną zamianą natywnych kontrolek na shadcn/ui; npm metadata sprawdzone (stabilna wersja, peer React19), zgodność Node24 potwierdzona buildem. Kompozycja Select/Trigger/Content/Item oparta na oficjalnym registry New York: https://ui.shadcn.com/r/styles/new-york/select.json i dokumentacji https://ui.shadcn.com/docs/components/radix/select.
- Wszystkie7 pól w formularzach podmienione. Typy i build PASS;74 unit PASS. Rozszerzony E2E PASS: rzeczywisty wybór opcji i zachowanie FormData w pełnym scenariuszu, Escape i powrót focusu, ArrowDown/End/Enter, Tab do następnego pola, desktop/mobile/dark i brak poziomego overflow. Baza wyłącznie testowa, brak migracji i zmian danych użytkownika.
- Zrzuty select-desktop-light.png i select-mobile-dark.png pokazują otwarte listy; animacje zakończone na potrzeby screenshotów. Menus są portallowane do .app-shell, aby zachować motyw i paletę.
