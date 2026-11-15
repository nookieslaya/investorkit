# InvestorKit
Polskojęzyczny SaaS do rozumienia portfela i symulowania zakupów. Etap1 ukończony; etap2 rozpoczęty. To kod foundation do lokalnego rozwijania, nie gotowa aplikacja inwestycyjna ani publiczny deployment.

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
- PostgreSQL/Drizzle: auth + portfolios, wygenerowana migracja, unikalny właściciel portfela i FK.
- Better Auth: signup/signin/signout/sesja; origin guard, HttpOnly/SameSite, rate limiting, brak logowania body i sekretów.
- API: GET /health, GET /ready, GET/POST /api/auth/*, GET/POST /api/v1/portfolios, GET /api/v1/portfolios/:id. Autoryzacja sesyjna i owner scope; limit jednego portfela w DB.
- Kontrakty Zod, decimal-string boundary, jawnie zablokowany adapter XTB.
- Vitest unit/integration, Playwright onboarding, workflow CI.

## Jeszcze niezaimplementowane
Silnik finansowy, ledger/wyceny, dashboard z realnymi wynikami, symulator, dziennik, import, upload/AI, landing z zapisem zainteresowania. Pakiety portfolio-engine i report-engine są świadomymi szkieletami, nie działającymi integracjami. Model pozostałych tabel jest specyfikacją, a nie migracją. Brak płatności i automatycznego pobierania raportów.

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
Integracja wymaga osobnej, migrowanej bazy testowej (nigdy produkcyjnej). Utwórz np. investorkit_test w swoim PostgreSQL, ustaw DATABASE_URL w lokalnym .env na tę bazę, uruchom migracje, a następnie:
```bash
TEST_DATABASE_URL=postgresql://investorkit:local_dev_only@127.0.0.1:5432/investorkit_test npm run test:integration
npx playwright install chromium
npm run test:e2e
```
E2E rejestruje konto testowe w DB wskazanej przez .env. Używaj bazy jednorazowej; testy integracyjne usuwają własne konta, E2E pozostawia konto do diagnostyki. Dostępna opcja PLAYWRIGHT_EXECUTABLE_PATH wskazuje własne Chromium. CI dostaje wyłącznie tymczasową bazę i sekret.

## Migracje
```bash
npm run db:generate
npm run db:migrate
```
Przejrzyj SQL przed zatwierdzeniem. Nie stosujemy drizzle-kit push w produkcji. Migrations path jest oparty o import.meta.url; CLI migrate uruchamia plik źródłowy przez tsx. Build API: npm run build, następnie npm run start -w @investorkit/api; frontend dist serwowany z jednego origin z /api reverse proxy. Hosting/HTTPS/CSP i publiczna konfiguracja nie są wdrożone.

## Granice bezpieczeństwa
Obecny auth jest sprawdzony lokalnie, lecz przed publicznym pilotem wymagane są email verification/reset, proces usunięcia/eksportu danych, polityka prywatności, restore drill oraz test E2E w środowisku obsługującym Chromium. Lista w backlogu B04–B06. Brak połączenia z brokerem i przechowywania jego haseł. Ograniczenia procesu in-memory rate limit są opisane w architekturze.

## Kontynuacja
Najpierw uruchom Playwright lokalnie/CI i zamknij F11, potem F12 (OpenAPI), następnie P01–P07. Zmieniaj README, backlog i HANDOFF po każdym etapie. Nie zaczynaj od płatności lub integracji AI. Nie dostarczono repozytorium zdalnego; kod i dokumentacja są w tym pakiecie.
