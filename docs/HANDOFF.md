# Stan projektu i następna sesja
15.11.2026: specyfikacja docs01–09 gotowa. Foundation zaimplementowane: monorepo, auth+portfolio schema/migracja, API z owner scope, UI konta/portfela, Compose i CI. Potwierdzone testy w VERIFICATION.md. Żadnego deployu/płatności/automatycznego pobierania.

Następna sesja:
1. Przeczytaj README, backlog i matematykę. Zainstaluj npm ci; wygeneruj env, uruchom DB i migracje.
2. Uruchom Playwright w lokalnym/CI środowisku, usuń błędy i wizualnie sprawdź desktop/mobile i dark mode. F11 jest PARTIAL do przejścia E2E/CI.
3. F12: OpenAPI/contract tests. Następnie P01–P07: czysty silnik i golden cases, bez dashboardu na fikcyjnych liczbach.
4. Potem A01–A09. Weryfikuj composite tenant FK, blokady ledgeru i idempotency keys przed udostępnieniem operacji.
5. XTB parser dopiero po próbce, AI po wdrożeniu bezpiecznych uploadów/budżetu/ACL.

Kluczowe decyzje: baza portfela PLN, instrumentyPLN/EUR/USD; wagi obejmują gotówkę; koszt średni analityczny, nie podatkowy; pieniądze jako decimal strings; historię kosztów FX zapisujemy przy operacji; brak wyceny = niekompletny wynik; raport prywatny domyślnie; publiczny cache po sprawdzeniu źródła.
Start z gotową wiadomością dla Codexa: CODEX-START.md. Historia wykonanych prac: ../CHANGELOG.md. Repozytorium zdalne nie zostało wskazane; przygotowany lokalny Git main i commit bazowy. Sekrety i DB testowa nie są w pakiecie. Lokalne buildy/node_modules także nie są w archiwum; odtwarzalne z lockfile. Wszystkie wymagania docelowego MVP i statusy są w backlogu.
