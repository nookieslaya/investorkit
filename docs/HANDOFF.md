# Stan projektu i następna sesja
15.11.2026: specyfikacja docs01–09 gotowa. Foundation zaimplementowane: monorepo, auth+portfolio schema/migracja, API z owner scope, UI konta/portfela, Compose i CI. Potwierdzone testy w VERIFICATION.md. Żadnego deployu/płatności/automatycznego pobierania.

Następna sesja:
1. Przeczytaj README, backlog i matematykę. Zainstaluj npm ci; wygeneruj env, uruchom DB i migracje.
2. F11 DONE: CI i 1 E2E w Chromium PASS. Osobno wizualnie sprawdź desktop/mobile i dark mode (F08/F09) oraz lokalny Compose (F03).
3. F12: OpenAPI/contract tests. Następnie P01–P07: czysty silnik i golden cases, bez dashboardu na fikcyjnych liczbach.
4. Potem A01–A09. Weryfikuj composite tenant FK, blokady ledgeru i idempotency keys przed udostępnieniem operacji.
5. XTB parser dopiero po próbce, AI po wdrożeniu bezpiecznych uploadów/budżetu/ACL.

Kluczowe decyzje: baza portfela PLN, instrumentyPLN/EUR/USD; wagi obejmują gotówkę; koszt średni analityczny, nie podatkowy; pieniądze jako decimal strings; historię kosztów FX zapisujemy przy operacji; brak wyceny = niekompletny wynik; raport prywatny domyślnie; publiczny cache po sprawdzeniu źródła.
Start z gotową wiadomością dla Codexa: CODEX-START.md. Historia wykonanych prac: ../CHANGELOG.md. Publiczne repozytorium: https://github.com/nookieslaya/investorkit; gałąź `main`, remote `origin`. Sekrety i DB testowa nie są w pakiecie. Lokalne buildy/node_modules także nie są w archiwum; odtwarzalne z lockfile. Wszystkie wymagania docelowego MVP i statusy są w backlogu.

Aktualizacja lokalna 15.11.2026 (macOS): historia Git odtworzona z bundle w bieżącym katalogu `investorkit`, gałąź `main`. Node 24 i GitHub CLI zainstalowane. `npm ci`, build, typecheck i 4 testy unit PASS; lockfile bez zmian. Docker daemon wyłączony, integracja/E2E niepowtórzone. Utworzono publiczne repozytorium https://github.com/nookieslaya/investorkit za zgodą użytkownika; `origin` ustawiony. Pierwszy CI PASS: build, typecheck, migracja, 4 unit, 8 integration i 1 Playwright E2E w Chromium. Dowód: https://github.com/nookieslaya/investorkit/actions/runs/43749258894. Następne zadanie implementacyjne: F12.
