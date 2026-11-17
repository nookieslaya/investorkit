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

Domknięcie 16.11.2026: CI dla `ee7cd47` [PASS](https://github.com/nookieslaya/investorkit/actions/runs/43759477411) — build/typecheck,74 unit,26 integration i1 E2E z wyborem opcji oraz klawiaturą. Zrzuty otwartej listy desktop/light i mobile/dark obejrzane po zakończeniu animacji; odstępy strzałek i motywy poprawne. Aplikacja lokalna gotowa, bez zmian danych i migracji.

## P05/A06 — symulator zakupu — 16.11.2026
- Node24: build/typecheck/OpenAPI,87 unit,31 integration i1 rozszerzony E2E Chromium. Testy integracji i przeglądarki wyłącznie na investorkit_contract_test, E2E5174/3002. Konto i historia użytkownika bez zmian; etap nie wymaga migracji ani nowych zależności.
- Golden4: budżet1000/cena300/fee5/scale0 → q3/koszt905/reszta95. Wartość995 przy istniejącej gotówce,1995 przy dopłacie nowych środków do portfela1000. Testy obejmują ułamki, średni koszt z prowizją, odrębną cenę wyceny, cenę0, brak/stare/przyszłe notowania, brak/stary/przyszły FX i granicę72h, pełne pokrycie budżetu, zerową ilość i maksymalny zakres.
- Dzielenie ilości chronione przed podniesieniem prawie całkowitego ilorazu przed floor. Delta liczona przed końcowym zaokrągleniem wartości przed/po; regresja na kwotach poniżej10 miejsc. Reszta i rzeczywisty koszt nie są zaokrąglane przed replay.
- API: owner scope404, sesja401, origin403, ścisły Zod400 i domenowe422. Wszystkie odpowiedzi walidowane OpenAPI16 operacji. Porównanie zawartości ledgeru/instrumentów/cen/FX i sald potwierdza brak zapisów po sukcesie, błędzie, powtórkach i równoległych symulacjach. Transakcja DB ma tryb READ ONLY.
- E2E: oba źródła z aktualnym FX i referencją inną od ceny zakupu, aktualizacja wyniku i czyszczenie po edycji, niezmienione salda/dashboard. Desktop i mobile/dark, selecty shadcn z klawiaturą, bez poziomego overflow. Zrzuty simulator-desktop.png i simulator-mobile-dark.png w ignorowanym test-results; średni koszt w tabeli zaokrąglony HALF_EVEN4.
- Ograniczenia: ręczne dane, próg72h, wyniki datowane i wymagające ponownego obliczenia po zmianie portfela; brak zapisu scenariuszy i zleceń. Standardowy build zachowuje informacyjne ostrzeżenie bundle>500kB. Brak pełnego audytu WCAG i publicznego deploymentu.

P05/A06 CI dla `f2209f3`: [PASS](https://github.com/nookieslaya/investorkit/actions/runs/43909008505) — build/typecheck, OpenAPI, migracje,87 unit,31 integration i1 E2E Chromium. Końcowe zrzuty desktop i mobile/dark obejrzane; poprawny układ porównania i formularza. Link pomijania treści pozostaje dostępny klawiaturą i ukryty poza focusem.

## Czytelny wynik symulacji — 16.11.2026
- Po uwadze użytkownika rozdzielono dopłatę, wartość portfela i wynik dokupowanej części (kwota/procent względem kosztu z prowizją). API `impact` liczy te wartości w czystym silniku decimal40; frontend wyłącznie formatuje. Koszt/market value/P&L pozostają osobne, zgodnie z rozróżnieniem opisanym w [Portfolio Performance](https://help.portfolio-performance.info/en/reference/view/reports/statement/) i [Sharesight](https://help.sharesight.com/us/show_portfolio/). To wzorzec prezentacji, bez deklaracji identycznych modeli kosztowych lub metod zwrotu.
- Regresja80PLN + nowe1000, zakup10×100, wycena70: wartość780, wpłaty netto1080, P/L−300, zmiana z dopłatą+700, wynik dokupionej części−300/−30%. Dodatkowo oba źródła, fee, FX, dodatnia różnica cen i brak/stale/future referencji. Braki innych instrumentów nie ukrywają znanego wyniku samego zakupu.
- Lokalnie build/typecheck/OpenAPI,89 unit,32 integration i1 E2E Chromium PASS. Testy na dedykowanej bazie, E2E5174/3002. E2E sprawdza oddzielny wynik i dopłatę dla obu źródeł oraz rozbicie różnicy cen i prowizji. Zrzuty simulator-desktop.png i simulator-mobile-dark.png obejrzane: osobne metryki, komunikat o cenach, tabela i rozliczenie bez poziomego overflow. Poprawiono wyrównanie pól ceny/prowizji.
- Cena zakupu nie nadpisuje referencji ani datowania; brak zmian ledgeru, wycen użytkownika, migracji i nowych zależności. EngineVersion0.5.1-simulation-impact. Ograniczenia: ręczne ceny/FX, ten sam próg72h, brak zapisu scenariuszy i zleceń. Następny etap nadal P06/A07.

Poprawka prezentacji wyniku `e118c58`: CI [PASS](https://github.com/nookieslaya/investorkit/actions/runs/43911228568) — build/typecheck/OpenAPI, migracje,89 unit,32 integration i1 E2E Chromium. Lokalna aplikacja korzysta z nowego kontraktu impact; po odświeżeniu ponów obliczenie symulacji.

## Uproszczony ekran symulatora — 16.11.2026
- Silnik portfolio-engine bez zmian. Porównanie wcześniejszego OpenAPI z nowym potwierdziło identyczność wszystkich16 istniejących operacji; kontrakt symulacji/impact, dane i precyzja bez zmian. Konieczny dodatkowy GET cen własnego instrumentu służy wyłącznie cenie domyślnej także dla nowej pozycji (dotychczasowe GET valuation zwraca tylko pozycje otwarte). Bez nowych zależności i migracji.
- Cena domyślna: ostatni nieprzyszły ręczny rekord w sequence order, świeżość72h jak w wycenie; data/źródło widoczne. Własny wpis lub wyczyszczone pole zachowane przy refetch. Przyszłe/stare/brakujące ceny nie uzupełniają pola. Test UI zmienia prawdziwe notowanie i odświeża zapytania kontrolowanym zegarem; obejmuje też powrót do instrumentu, nową pozycję, brak, stale i przyszły rekord adaptera.
- Formatowanie:4 nowe testy pieniędzy2/HALF_EVEN (także duże kwoty i ujemne zero), ilości≤6/≈/bez zer, sub-cent cash i adaptacyjnego średniego kosztu. Formatowanie wyłącznie tekst/BigInt; brak liczenia wyników z prezentacji. Dotychczasowe funkcje formatowania pozostałych ekranów zachowują semantykę.
- Lokalnie na Node24: build:packages, typecheck, build, openapi:check,93 unit (w tym pełne istniejące testy silnika),32 integration oraz2 E2E Chromium PASS. Rozszerzone istniejące testy kontraktowe potwierdziły401/404/brak obcych notowań i rzeczywiste rekordy GET cen. Testy integracyjne/E2E na investorkit_contract_test; E2E na5174/3002.
- E2E onboarding nadal sprawdza oba finansowania, FX/prowizję, trwałość i niezmienność sald po symulacji. Operacje i ich historia nie są montowane w symulatorze, ale pozostają dostępne po przełączeniu. Szczegóły zamknięte domyślnie, otwierane Enter/Space; ostrzeżenia poza nimi. Keyboard Select synchronizuje powrót focusu przed Tab.
- Obejrzano4 zrzuty: simulator-desktop-light.png, simulator-desktop-dark.png, simulator-mobile-light.png i simulator-mobile-dark.png. Widok390×844 bez poziomego overflow także po rozwinięciu tabeli. Dane testowe, nie sesja użytkownika. Zrzuty w ignorowanym test-results.
- Porządki: usunięte stare karty outcome/totals, otwarte assumptions, nieużywane selektory cash-nav i style dawnego rozliczenia, zbędny import ArrowUpRight. Formatowanie ma wspólną prywatną funkcję zaokrąglania; brak dwóch równoległych wariantów ekranu. Nie usuwano funkcji ani danych gotówki. Znane ostrzeżenie build o bundle>500kB pozostaje informacyjne; pełny audyt WCAG poza zakresem.

Uproszczenie `57482da`: CI [PASS](https://github.com/nookieslaya/investorkit/actions/runs/43915933522) — build/typecheck/OpenAPI, migracje,93 unit,32 integration,2 E2E Chromium. Dodatkowa lokalna kontrola frontendu `tsc --noEmit --noUnusedLocals --noUnusedParameters` PASS. Wszystkie4 warianty widoku obejrzane; silnik i16 wcześniejszych kontraktów bez zmian.

## P06/A07 — koncentracja i testy spadków — 16.11.2026
- Wdrożono czyste analyzeRisk/stressPortfolio: pełny mianownik z gotówką, Top3/5 samych papierów, UNKNOWN/CASH w strukturze, progi strict>, brak fałszywych udziałów przy niepełności/zerze. FX i cash stałe w szoku; wyniki oraz ceny scenariusza liczone z niezaokrąglonego stanu decimal40, końcowe money HALF_EVEN10.
- Golden5 PASS:600/300/100 +cash100 daje największą54.5454…%, Top3=90.9090…%; szok50% wszystkich papierów→600/ubytek500, jednej pozycji600→800/ubytek300. Dodatkowe12 unit:0/100%, całkowite wyzerowanie bez gotówki, cash-only/empty, threshold equality/ordering, brak/stale/future/FX, nieznane metadane, stabilne remisy i immutability, USD/current FX/historyczny koszt, mikrokwoty i ceny scenariusza>10 miejsc bez zaokrągleń pośrednich.
- Migracja0003 wygenerowana i przejrzana: tylko CREATE risk_settings i constraints/FK. Zastosowana na testowej i lokalnej bazie po prywatnym pg_dump w ignorowanej .local-backups. Konto i historia użytkownika nie były danymi testowymi, bez zmian starych transakcji/sald/notowań. Bez nowych bibliotek. Restore drill pozostaje osobnym zadaniem.
- API: GET risk, GET/PATCH risk-settings z If-Match/revision/ETag i lock portfela, POST stress-tests READ ONLY. Default settings GET nie zapisuje wiersza. OpenAPI21 operacji aktualne; porównanie z poprzednim dokumentem potwierdziło zachowanie schematów/parametrów/odpowiedzi17 wcześniejszych operacji (opis wyceny doprecyzowany do konfigurowanej świeżości).
- Dodano8 realnych integration PostgreSQL: golden/metadata/owner/session/origin, brak write po powtórkach/równoległych stress, strict DTO i precondition428, spójne ustawienia wieku dla valuation/simulation/risk/stress, konkurujące PATCH z jednym zwycięzcą i409, bezpośredni tenant/order/age/revision CHECK w DB. Wszelkie dane testowe tylko w investorkit_contract_test.
- Lokalnie Node24: build:packages, typecheck, build, openapi:check,105 unit,40 integration i3 E2E Chromium PASS; dodatkowy frontend tsc noUnusedLocals/noUnusedParameters PASS. Znane informacyjne ostrzeżenie bundle>500kB nie zmienia wyniku build.
- Trzeci E2E Ryzyko ma rzeczywiste konto/portfel w bazie testowej i zwalidowane fixture risk/stress/settings odpowiedzi, by izolować prezentację i nie przekraczać wspólnego rate limitu API. Sprawdza oba zakresy szoku, flagi, UNKNOWN, reset/saved revision nagłówki, zmianę świeżości i widoczną niepełność, reload i klawiaturę. Nie zastępuje realnych integration zapisów ustawień ani unit obliczeń. Dotychczasowe2 E2E (onboarding/symulator) pozostają realnym API.
- Obejrzano risk-desktop-light.png, risk-desktop-dark.png, risk-mobile-light.png i risk-mobile-dark.png. Scenariusz/próg oddzielone od prognoz/oceny bezpieczeństwa, dane źródłowe w szczegółach, poprawne selecty i brak poziomego overflow przy390×844. Screenshoty/test-results ignorowane w Git. Pełny audyt WCAG poza etapem.
- Odświeżanie cache po ledger/cash/quote/FX uwzględnia risk. Zapisy wieku danych invalidują risk/valuation i czyszczą stary scenariusz. Wspólne progi bez sztywnego72h w komunikatach błędów/formularzach. Nie dodano zapisu scenariuszy, zleceń, market feeds, rekomendacji ani ETF look-through.

P06/A07 `055dcdc`: CI [PASS](https://github.com/nookieslaya/investorkit/actions/runs/43928508396) — build/typecheck/OpenAPI, migracje,105 unit,40 integration i3 E2E Chromium. Lokalny widok Ryzyko dostępny pod #risk, konto i dane zachowane. Kolejny punkt P07, następnie A08.

## Uproszczenie scenariuszy spadków — 16.11.2026
- Zapoznano się z AGENTS, README, HANDOFF, backlogiem, dokumentacją obliczeń/API oraz implementacją i testami przed zmianą. Silnik, shared/API/OpenAPI, migracje i zależności bez zmian. Usunięto dawny renderer wyniku i nieużywane style/importy; git diff --check oraz frontend noUnusedLocals/noUnusedParameters PASS.
- Lokalnie Node24: npm run build:packages, npm run typecheck, npm run build, npm run openapi:check, npm test (107 testów/9 plików), npm run test:integration (40/5), npm run test:e2e (3 Chromium) PASS. Testy na dedykowanej investorkit_contract_test, E2E5174/3002; dane aplikacji użytkownika nie są używane. Build zachowuje znane informacyjne ostrzeżenie bundle>500kB.
- Nowy golden: portfel11699,50, pozycja600, spadek40% → pozycja360, portfel11459,50, zmiana−240/−2,05%, udział5,13%→3,14%. Pokryty unit i zwalidowaną prezentacją E2E. Dodatkowo test znaków/zer/null w formatowaniu i rozszerzenie missingFX. Istniejące0/100%, brak/stale/future cen/FX i rzeczywiste testy PostgreSQL braku zapisów po powtórkach/równoległych scenariuszach nadal przechodzą.
- UI E2E: oba zakresy, presety/custom0/100%, target-only w głównym wyniku, szczegóły Enter/Space, źródła i daty, widoczne braki, ustawienia domyślnie zwinięte, reset wyniku po zmianie zakresu/pozycji/procentu, identycznym automatycznym refetch, zmienionych danych, ręcznym odświeżeniu i późnej odpowiedzi. Parametry zachowane, stare hashe działają z nowymi etykietami. Fixture risk/stress/settings walidowane schematami i liczone przez istniejący silnik; realny backend jest sprawdzany przez40 testów integracyjnych, a onboarding/symulator nadal przez rzeczywiste API w E2E.
- Obejrzano cztery aktualne zrzuty risk-desktop-light.png, risk-desktop-dark.png, risk-mobile-light.png i risk-mobile-dark.png w ignorowanym test-results. Desktop oraz390×844, obie palety, widoczny focus i bez poziomego overflow. Kontrola klawiatury nie jest pełnym audytem WCAG. Bez publicznego deploymentu, nowych zależności i zmian danych w tym zadaniu.

Uproszczenie scenariuszy `5737d75`: CI [PASS](https://github.com/nookieslaya/investorkit/actions/runs/43934016619) — build/typecheck/OpenAPI, migracje dedykowanej bazy,107 unit,40 integration i3 E2E Chromium.

## Scrollbar historii gotówki — 16.11.2026
- Poprawiono odstęp od paska i jego wygląd oraz przyczynę łamania kwot przez długą notatkę. Cienki pasek zachowuje natywne przewijanie; nazwana lista z tabIndex korzysta z istniejącego focus-visible. Brak nowych zależności, zmian silnika/API i danych użytkownika.
- Node24: build:packages, typecheck,107 unit, build i3 E2E Chromium PASS. Po dodaniu jawnej walidacji odpowiedzi fixture ponownie typecheck i onboarding E2E PASS. git diff --check PASS. Znane ostrzeżenie bundle>500kB pozostaje informacyjne. Testy integracji nie były ponawiane lokalnie dla tej zmiany CSS/HTML.
- Istniejący onboarding E2E rozszerzono o12 wpisów historii z długą notatką i kwotą5500. Historia jest chwilowo podmieniona przez route na bazie rzeczywistej odpowiedzi walidowanej cashHistorySchema, następnie mock usunięty; brak dodatkowych zapisów ledgeru. Sprawdzono brak poziomego overflow listy/strony, jednowierszowy zapis kwoty i jej odstęp od krawędzi obszaru przewijania, focus oraz End/Home. Konto/portfel testowe wyłącznie w investorkit_contract_test, własne serwery5174/3002.
- Obejrzano cash-history-1280-light/dark i cash-history-390-light/dark w ignorowanym test-results. Na mobile kwota jest pod opisem; desktop w osobnej kolumnie. Wygląd natywnego paska zależy także od przeglądarki i ustawień systemowych; miejsce na pasek i odstęp chronią tekst. Pełny audyt WCAG poza zakresem.

Poprawka historii gotówki `ffbc28e`: CI [PASS](https://github.com/nookieslaya/investorkit/actions/runs/43935049587) — build/typecheck/OpenAPI, migracje,107 unit,40 integration i3 E2E Chromium.

## P07 — przegląd regresji i granic — 17.11.2026
- Przeczytano instrukcje, README/HANDOFF/backlog, dokumentację obliczeń/API oraz przejrzano istniejące testy i kod P02–P06. Mapa golden1–7 i granic w docs/04-calculations.md. Uzupełniono istotne luki bez zmiany algorytmów, zaokrągleń, wersji silnika, kontraktów, migracji, UI i zależności. Przegląd nie wykazał usterki wymagającej zmian implementacji.
- Nowe17 unit: przekrojowe golden1/2 i6/7, zerowe/ujemne wkłady z dodatnim P/L, brak pełnej wyceny bez ceny, kolejność operacji o tym samym timestampie, legalne duplikaty, sub-storage cash i zamknięcie, overflow replay/FX/wyceny, osobny próg FX z granicą1ms; w6 testach18 kombinacji waluty/finansowania/skali ilości. Oczekiwane kwoty/cash/ilości/reszty/P&L literalne, nie generowane testowanymi funkcjami.
- Nowe2 integracyjne na rzeczywistym PostgreSQL: identyczne BUY z różnymi kluczami vs retry/409; brak zmian ledgeru/notowań/wyceny po odrzuconych operacjach i przyszłej cenie. SELECT przed/po z jawną kolejnością; odpowiedzi nadal sprawdzane niezależnym walidatorem OpenAPI. Starsze testy owner/lock/race i braku zapisów po symulacjach nadal przechodzą.
- Lokalnie Node24: build:packages, typecheck, npm test124/10 plików, build, openapi:check, test:integration42/5 plików i test:e2e3 Chromium PASS. Wyłącznie investorkit_contract_test, E2E5174/3002. Brak użycia lub zmiany danych użytkownika. Znane informacyjne ostrzeżenie bundle>500kB bez błędu. Nie dodawano migracji ani nowych bibliotek.
- UI bez zmian; istniejące3 E2E uruchomione ponownie, bez deklarowania nowej ręcznej inspekcji wizualnej ani pełnego audytu WCAG. Nie wdrożono importu/AI/TWR/XIRR/PIT. Następny etap A08 — prywatny dziennik decyzji.

P07 `7e62237`: CI [PASS](https://github.com/nookieslaya/investorkit/actions/runs/44119931992) — build/typecheck/OpenAPI, migracje,124 unit,42 integration i3 E2E Chromium. Etap zamknięty, następny A08.

## A08 — prywatny dziennik decyzji — 17.11.2026
- Przeczytano AGENTS/README/HANDOFF/backlog, model/API i zakres A08. Zaimplementowano CRUD journal, owner scope, nullable własny instrument, ograniczenia dat/tekstu, plain text i100 wpisów. PATCH/DELETE wymagają If-Match/revision i lock wpisu; szkic edycji zachowany przy konflikcie/refetch, jawne wczytanie aktualnej wersji. Usunięcie po potwierdzeniu. Brak zmian silnika/ledgeru i zależności.
- Migracja0004 wygenerowana i przejrzana: CREATE dziennika, composite FK/CHECK/indeksy. Przeniesiono instrument_id_owner PRZED jego FK. PASS na dedykowanej bazie testowej, potem lokalnej aplikacji po prywatnym pg_dump w ignorowanej .local-backups (chmod przez umask077). pg_restore --list PASS; pełny restore drill nie był wykonywany. Bez UPDATE/DELETE dotychczasowych danych i wpisów testowych w koncie użytkownika. API lokalnego nowego endpointu bez sesji zwraca401.
- Node24: build:packages, typecheck,125 unit/11 plików, build, openapi:check,49 integration/6 plików oraz4 E2E Chromium PASS; noUnusedLocals/noUnusedParameters web i git diff --check PASS. Po porządkach w E2E powtórzono typecheck i projekt journal-chromium PASS. Znane informacyjne ostrzeżenie bundle>500kB pozostaje. Dotychczasowe21 operacji OpenAPI porównane z poprzednim dokumentem: identyczne; doszły4, obecnie25.
- Nowy unit kontraktu: trim/defaulty/plain text oraz odrzucenie obcych pól, błędnych dat/UUID i przekroczeń długości.7 nowych integracyjnych na prawdziwym PostgreSQL: sesja/origin/owner404, prywatne pola niewidoczne, własny instrument nieposiadany, walidacja/If-Match428/400, race PATCH z jednym200 i409, stale DELETE409 i usunięty404, kolejność listy, zachowany istniejący ledger/notowania/FX, bezpośrednie cross-tenant FK/CHECK, race create przy99 wpisach→201/422 i pełna lista100.
- Nowy E2E używa rzeczywistych API i bazy: pełny wpis z instrumentem, trwałość po reload, HTML jako tekst bez img/script, szczegóły Enter/Space, focus edytora, dwie wersje wpisu i zachowanie szkicu przy409/odświeżeniu, jawny reload, zapis nowej wersji, odmowa anonimowemu odczytowi, anulowanie/potwierdzenie DELETE, trwały brak po reload oraz niezmieniona gotówka. Obejrzano4 zrzuty journal-1280-light/dark i journal-390-light/dark (test-results ignorowane), bez overflow, poprawna ikona daty dark. Pełny audyt WCAG poza etapem.
- Pierwsze próby wykryły etykietę zawierającą licznik znaków (rozdzielono label i aria-describedby) oraz współdzielony limit rate przy czterech scenariuszach. Dziennik ma osobny projekt i instancje serwerów, bez osłabienia rate limitów, wyłączania ochrony czy arbitralnych opóźnień w testach. Lokalnie5174/3002 i5175/3003; CI5173/3001 i5174/3002. Wyłącznie investorkit_contract_test, nie aplikacja użytkownika.
- Ograniczenia:100 wpisów, pełne zastąpienie pól PATCH, brak idempotencji tworzenia, archiwum wersji/scalania/autosave szkiców, brak publicznego deploymentu i pełnego audytu WCAG. Następny etap A09 — rzeczywiste snapshoty z jawnymi lukami.

A08 `1e0f86f`: CI [PASS](https://github.com/nookieslaya/investorkit/actions/runs/44124139425) — build/typecheck/OpenAPI, migracje na pustej bazie,125 unit,49 integration i4 E2E Chromium. Lokalny dziennik #journal gotowy; następny A09.
