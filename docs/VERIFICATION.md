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
