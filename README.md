# InvestorKit
Polskojęzyczny SaaS do rozumienia portfela i symulowania zakupów. Foundation ukończone; rozpoczęty etap silnika finansowego. To kod foundation do lokalnego rozwijania, nie gotowa aplikacja inwestycyjna ani publiczny deployment.

## Start tutaj
- [Pełna specyfikacja](docs/INVESTORKIT-MVP.md)
- [Backlog](docs/08-backlog.md)
- [Architektura](docs/02-architecture.md), [model danych](docs/03-data-model.md), [API](docs/05-api.md)
- [Obliczenia](docs/04-calculations.md), [import/AI](docs/06-import-reports.md)
- [Start w Codexie / VS Code](docs/CODEX-START.md), [historia prac](CHANGELOG.md)
- [Raport weryfikacji](docs/VERIFICATION.md), [kontynuacja](docs/HANDOFF.md)

## Zaimplementowane
- npm workspaces i TypeScript strict; dokładne wersje + package-lock.json.
- React/Vite, TanStack Router/Query, Tailwind4; lokalny komponent Button w konwencji shadcn/ui (Radix Slot/CVA), aliasy i components.json; pozostałe komponenty dodawać w miarę potrzeb.
- Responsywny interfejs PL, motywy light/dark (domyślnie ustawienie systemu), formularze konta/portfela, stany loading/error/empty. Puste wartości są oznaczone kreską, bez fikcyjnych wyników.
- PostgreSQL/Drizzle: auth, portfolios, instruments, manual_quotes, fx_rates i wspólny ledger cash_operations; migracje, composite tenant FK, CHECK i blokada portfela.
- Better Auth: signup/signin/signout/sesja; origin guard, HttpOnly/SameSite, rate limiting, brak logowania body i sekretów.
- API: GET /health, GET /ready, GET/POST /api/auth/*, GET/POST /api/v1/portfolios, GET /api/v1/portfolios/:id. Autoryzacja sesyjna i owner scope; limit jednego portfela w DB.
- Kontrakty Zod, decimal-string boundary, jawnie zablokowany adapter XTB.
- P04: wycena pozycji i gotówki, nominalny P/L, prosta stopa od wpłat netto, źródła i zakres dat; braki/stale/future nie udają pełnej wyceny.
- Inwestycje na froncie: instrumenty, zakup/sprzedaż, historia, ręczne ceny i kursy, tabela pozycji na desktopie i karty na telefonie.
- P03: chronologiczny replay, gotówka w PLN/EUR/USD, historyczny koszt bazowy/FX i wpłaty netto; panel sald, wpłaty/wypłaty i historia na froncie.
- P02: niemutowalne pozycje BUY/SELL, średni koszt i wynik sprzedaży w walucie instrumentu, prowizje i blokada oversell; przypadki kontrolne1/2 kosztu PASS.
- P01: czysta arytmetyka `FinancialDecimal` (decimal.js, precision40, HALF_EVEN), walidacja kwot/ilości/prowizji i jawne granice zaokrągleń.
- Vitest unit/integration, Playwright onboarding, workflow CI.
- OpenAPI 3.0.3 generowane z Zod: [dokument](docs/openapi.json), lokalnie `/api/v1/openapi.json`; testy odpowiedzi i kontrola aktualności w CI.

## Jeszcze niezaimplementowane
Symulator, koncentracja i stress, dziennik, import XTB, upload/AI, snapshoty historyczne i landing z zapisem zainteresowania. portfolio-engine zawiera P01–P04; API/UI używają wspólnego ledgeru oraz ręcznych cen/FX. report-engine pozostaje szkieletem. Pozostałe tabele raportów/importu/dziennika są specyfikacją. Brak płatności, danych rynkowych na żywo i automatycznego pobierania raportów.

## Uruchomienie lokalne
Wymagania: Node24 LTS, npm11+, Docker z Compose. Rozpakuj archiwum i wejdź do katalogu investorkit.
```bash
npm ci
npm run setup:env
docker compose up -d --wait
npm run build:packages
npm run db:migrate
npm run dev
```
Otwórz http://localhost:5173 (konsekwentnie localhost, nie127.0.0.1 w przeglądarce). API nasłuchuje 127.0.0.1:3001. Ruch /api z Vite jest proxy do backendu; sesja działa przez jeden origin. DATABASE_URL w .env.example dotyczy wyłącznie lokalnego Compose. Nie używaj lokalnego hasła DB w produkcji. .env generowany z losowym sekretem, nie trafia do archiwum ani git.
Zmiana portu frontendu wymaga aktualizacji WEB_ORIGIN, BETTER_AUTH_URL i proxy/testów. npm run dev buduje pakiety przed startem, ale nie obserwuje ich zmian — po edycji pakietu ponów npm run build:packages.

## Build i testy
```bash
npm run build
npm run typecheck
npm test
```
Integracja i E2E wymagają osobnej, migrowanej bazy testowej. Lokalne `.env` pozostaw dla Twojej aplikacji. Zewnętrzna zmienna DATABASE_URL nadpisuje wartość z env-file podczas migracji. Przykład (baza musi istnieć):
```bash
DATABASE_URL=postgresql://investorkit:local_dev_only@127.0.0.1:5432/investorkit_contract_test npm run db:migrate
TEST_DATABASE_URL=postgresql://investorkit:local_dev_only@127.0.0.1:5432/investorkit_contract_test npm run test:integration
npx playwright install chromium
TEST_DATABASE_URL=postgresql://investorkit:local_dev_only@127.0.0.1:5432/investorkit_contract_test E2E_WEB_PORT=5174 E2E_API_PORT=3002 npm run test:e2e
```
E2E uruchamia osobne serwery i nie używa istniejącej sesji aplikacji. `TEST_DATABASE_URL` jest wymagane; konta testowe E2E pozostają tylko w tej bazie. CI używa tymczasowego PostgreSQL. Scenariusz obejmuje konto, portfel, wpłatę/wypłatę, odrzucenie debetu i historyczny kurs USD; generuje zrzuty desktop/mobile/dark w `test-results/`.

## Migracje
```bash
npm run db:generate
npm run db:migrate
```
Przejrzyj SQL przed zatwierdzeniem. Nie stosujemy drizzle-kit push w produkcji. Migrations path jest oparty o import.meta.url; CLI migrate uruchamia plik źródłowy przez tsx. Build API: npm run build, następnie npm run start -w @investorkit/api; frontend dist serwowany z jednego origin z /api reverse proxy. Hosting/HTTPS/CSP i publiczna konfiguracja nie są wdrożone.

## Granice bezpieczeństwa
Obecny auth jest sprawdzony lokalnie, lecz przed publicznym pilotem wymagane są email verification/reset, proces usunięcia/eksportu danych, polityka prywatności, restore drill oraz test E2E w środowisku obsługującym Chromium. Lista w backlogu B04–B06. Brak połączenia z brokerem i przechowywania jego haseł. Ograniczenia procesu in-memory rate limit są opisane w architekturze.

## Kontynuacja
F11 zamknięte: pierwszy GitHub Actions przeszedł, w tym Playwright w Chromium. F12 ukończone: OpenAPI i testy kontraktów. P01–P04 i A01–A05 ukończone dla ręcznego MVP; następnie P05–P07. Widoki inwestycji i gotówki sprawdzone na desktopie/mobile/dark; pełny audyt dostępności pozostaje przed pilotem. Zmieniaj README, backlog i HANDOFF po każdym etapie. Nie zaczynaj od płatności lub integracji AI. Historia Git została odtworzona lokalnie z bundle. Publiczne repozytorium: [nookieslaya/investorkit](https://github.com/nookieslaya/investorkit). Lokalnie na macOS potwierdzono build, typecheck i 4 testy unit na Node 24; szczegóły w raporcie weryfikacji.

CI potwierdza build, typecheck, migrację, 4 testy jednostkowe, 8 integracyjnych i 1 E2E: [pierwszy przebieg](https://github.com/nookieslaya/investorkit/actions/runs/43749258894).

Generowanie OpenAPI po zmianie DTO: `npm run build:packages && npm run openapi:generate`. Kontrola aktualności: `npm run openapi:check`. Zakres i ograniczenia: [kontrakty API](docs/05-api.md).

## Gotówka w działającym interfejsie
Po zalogowaniu i utworzeniu portfela widać salda PLN/EUR/USD, wpłaty netto według historycznych kursów oraz formularz i historię. Wybierz walutę, kwotę i datę; dla EUR/USD podaj historyczny kurs PLN za1 jednostkę oraz datę kursu. Dane są zapisywane i pozostają po odświeżeniu. Nie ma automatycznej wymiany walut. Wycenę inwestycji i P/L znajdziesz w sekcji Inwestycje.

API: `GET /api/v1/portfolios/:id/cash`, `GET/POST /api/v1/portfolios/:id/cash-operations`. POST wymaga UUID `Idempotency-Key`; identyczne ponowienie zwraca tę samą operację. Limit tej wersji:1000 operacji łącznie (wpłaty/wypłaty/BUY/SELL) na portfel. Historia jest append-only; korekty i edycja nie są udostępnione.

## Inwestycje i wycena
1. Zasil właściwe subkonto walutowe w panelu gotówki.
2. W sekcji Inwestycje dodaj instrument (STOCK/ETF, symbol, MIC, waluta i precyzja ilości), potem zapisz zakup. Prowizja jest w walucie transakcji, a historyczny FX służy bazie kosztu PLN.
3. Wpisz oddzielnie ręczną cenę wyceny z datą oraz bieżący kurs wyceny dla EUR/USD. Cena zakupu nie jest automatycznie ceną wyceny, a historyczny FX nie zastępuje bieżącego kursu.
4. Zobacz wartość pozycji, niezrealizowany wynik, udział z gotówką oraz nominalny P/L portfela. Możesz zapisać częściową lub pełną sprzedaż; saldo i koszt przeliczą się z całej historii.

Dane starsze niż72h są nieaktualne. Przy brakujących/starych danych pełna wartość i P/L są kreską, a osobno pokazana jest tylko wyceniona część. Przyszłe ceny/kursy nie są dopuszczane do zapisu ani używane do historycznej wyceny. Wpłaty netto≤0 dają brak procentu. Prosta stopa nie uwzględnia czasu przepływów; koszt średni jest analityczny, nie podatkowy. Kursy i ceny są wpisami użytkownika, bez notowań live.

API: GET/POST `/api/v1/instruments`, POST `/api/v1/instruments/:id/quotes`, POST `/api/v1/fx-rates`, GET/POST `/api/v1/portfolios/:id/operations`, GET `/api/v1/portfolios/:id/valuation?asOf=...`. OpenAPI obejmuje15 operacji. Limity tej wersji:100 instrumentów/użytkownika, 500 cen/instrument i1000 kursów wyceny/użytkownika. Dane są append-only, bez edycji/korekt i stronicowania w tym etapie.
