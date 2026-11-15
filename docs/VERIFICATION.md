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
