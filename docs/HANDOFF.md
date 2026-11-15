# Stan projektu i następna sesja

15.11.2026: foundation działa lokalnie i jest opublikowane w publicznym repozytorium https://github.com/nookieslaya/investorkit (`origin`, `main`). Użytkownik potwierdził rejestrację, logowanie i utworzenie portfela. F03 i F11 DONE. Lokalny Docker Compose PostgreSQL17 działa, migracja wykonana. F08/F09 nadal PARTIAL: pozostaje wizualna inspekcja desktop/mobile/dark mode.

F12 DONE: `apps/api/src/openapi.ts` generuje OpenAPI 3.0.3 z DTO Zod bez nowych zależności. Endpoint `/api/v1/openapi.json` dostępny bez sesji, artefakt `docs/openapi.json`; `npm run openapi:generate` / `npm run openapi:check` po `build:packages`. Dokument obejmuje tylko pięć wdrożonych operacji własnych (health/ready/portfele); Better Auth i docelowy MVP poza zakresem. Testy sprawdzają rzeczywiste odpowiedzi przez niezależny walidator JSON Schema, również błędy i izolację właściciela.

Następna sesja:
1. Przeczytaj README, backlog, docs/04-calculations.md. Następne małe zadanie: P01 (decimal i operacje domain), potem P02–P07 z golden cases. Silnik finansowy nadal jest szkieletem; bez dashboardu z fikcyjnymi wynikami.
2. Potem A01–A09: composite tenant FK, blokady ledgeru i idempotencja przed udostępnieniem operacji.
3. XTB po otrzymaniu próbki; AI po bezpiecznych uploadach, budżecie i ACL. Bez płatności i automatycznego pobierania raportów.

Weryfikacja F12: Node24, build/typecheck/7 unit i10 integration PASS; osobna migrowana baza `investorkit_contract_test`, bez testów na danych użytkownika. E2E dla F12 sprawdzane w GitHub Actions; wyniki i ograniczenia w VERIFICATION.md. Lokalne `.env`, node_modules i buildy są ignorowane przez Git. Nie zmieniaj bazy użytkownika na testową.

Kluczowe decyzje: baza PLN; instrumenty PLN/EUR/USD; wagi obejmują gotówkę; średni koszt analityczny nie jest rozliczeniem podatkowym. Decimal strings i historyczny FX; brak wyceny oznacza niekompletny wynik; raport prywatny domyślnie. Historia: ../CHANGELOG.md.
