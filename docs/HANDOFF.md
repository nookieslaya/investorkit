# Stan projektu i następna sesja

15.11.2026: foundation działa lokalnie i jest opublikowane w publicznym repozytorium https://github.com/nookieslaya/investorkit (`origin`, `main`). Użytkownik potwierdził rejestrację, logowanie i utworzenie portfela. F03 i F11 DONE. Lokalny Docker Compose PostgreSQL17 działa, migracja wykonana. F08/F09 nadal PARTIAL: pozostaje wizualna inspekcja desktop/mobile/dark mode.

F12 DONE: `apps/api/src/openapi.ts` generuje OpenAPI 3.0.3 z DTO Zod bez nowych zależności. Endpoint `/api/v1/openapi.json` dostępny bez sesji, artefakt `docs/openapi.json`; `npm run openapi:generate` / `npm run openapi:check` po `build:packages`. Dokument obejmuje tylko pięć wdrożonych operacji własnych (health/ready/portfele); Better Auth i docelowy MVP poza zakresem. Testy sprawdzają rzeczywiste odpowiedzi przez niezależny walidator JSON Schema, również błędy i izolację właściciela.

Następna sesja:
1. Przeczytaj README, backlog, docs/04-calculations.md. Następne małe zadanie: P03 (gotówka, wpłaty/wypłaty, historyczny FX/koszt PLN), potem P04–P07 z golden cases. P01 DONE: `FinancialDecimal` i guardy, precision40/HALF_EVEN, jawna serializacja do numeric(28,10); P02 lokalnego BUY/SELL DONE, historyczny koszt PLN/FX i wyceny nadal niewdrożone; bez dashboardu z fikcyjnymi wynikami.
2. Potem A01–A09: composite tenant FK, blokady ledgeru i idempotencja przed udostępnieniem operacji.
3. XTB po otrzymaniu próbki; AI po bezpiecznych uploadach, budżecie i ACL. Bez płatności i automatycznego pobierania raportów.

Weryfikacja F12: Node24, build/typecheck/7 unit i10 integration PASS; osobna migrowana baza `investorkit_contract_test`, bez testów na danych użytkownika. F12 CI PASS (7 unit, 10 integration, 1 Chromium E2E): https://github.com/nookieslaya/investorkit/actions/runs/43750687345; wyniki i ograniczenia w VERIFICATION.md. Lokalne `.env`, node_modules i buildy są ignorowane przez Git. Nie zmieniaj bazy użytkownika na testową.

Kluczowe decyzje: baza PLN; instrumenty PLN/EUR/USD; wagi obejmują gotówkę; średni koszt analityczny nie jest rozliczeniem podatkowym. Decimal strings i historyczny FX; brak wyceny oznacza niekompletny wynik; raport prywatny domyślnie. Historia: ../CHANGELOG.md.

P01 15.11.2026: brak nowych zależności (decimal.js10.6.0 już w lockfile). 16 testów podstawy arytmetyki, łącznie23 unit. Opis publicznego API arytmetyki i ograniczeń w docs/04-calculations.md. Kwoty/ilości/ceny do10 miejsc; FX12 i powiązane DTO dopiero w P03. Kod domeny nie ma IO ani zegara. Wyniki lokalne/CI: VERIFICATION.md.

P01 CI PASS (23 unit, 10 integration, 1 E2E Chromium): https://github.com/nookieslaya/investorkit/actions/runs/43751311427. Następne zadanie: P03.

P02: `Position.empty(instrument)` i `.applyTrade(unknown)` (walidacja Zod z shared) zwracają nowe stany. Metadane: instrumentId UUID, currency, quantityScale0–10. Transakcja: kind BUY/SELL, instrumentId, currency, quantity, unitPrice, commission, commissionCurrency. Snapshot zawiera quantity, remainingCostLocal, averageCostLocal|null; wynik transakcji gross/commission/cashDelta/releasedCost/realizedLocal jest jawnie w walucie instrumentu. Snapshot diagnostyczny zachowuje precision40 i nie jest gotowym rekordem DB. Saldo/stać-na-BUY to P03; odtwarzanie pełnego ledgeru i walidacja operacji wstecznych nadal przed nami.

28 nowych testów pozycji, łącznie51 unit PASS; build/typecheck/OpenAPI PASS. Nowa zależność wewnętrzna engine → shared służy wspólnym DTO Zod; bez nowych pakietów zewnętrznych i zmian ich wersji. Poprawiono odrzucanie końcowych nowych linii przez wspólny decimalSchema.
