# InvestorKit
Polskojęzyczny SaaS do rozumienia portfela i symulowania zakupów. Ręczny silnik finansowy i przegląd regresji P01–P07 ukończone; następny etap to dziennik decyzji. Projekt do lokalnego rozwijania, bez publicznego deploymentu.

## Start tutaj
- [Pełna specyfikacja](docs/INVESTORKIT-MVP.md)
- [Backlog](docs/08-backlog.md)
- [Architektura](docs/02-architecture.md), [model danych](docs/03-data-model.md), [API](docs/05-api.md)
- [Obliczenia](docs/04-calculations.md), [import/AI](docs/06-import-reports.md)
- [Start w Codexie / VS Code](docs/CODEX-START.md), [historia prac](CHANGELOG.md)
- [Raport weryfikacji](docs/VERIFICATION.md), [kontynuacja](docs/HANDOFF.md)

## Zaimplementowane
- npm workspaces i TypeScript strict; dokładne wersje + package-lock.json.
- React/Vite, TanStack Router/Query, Tailwind4; lokalne komponenty Button i Select shadcn/ui (Radix Slot/Select), aliasy i components.json. Wszystkie wybory w formularzach używają wspólnego Select z obsługą klawiatury i jasnego/ciemnego motywu.
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
Dziennik, import XTB, upload/AI, snapshoty historyczne i landing z zapisem zainteresowania. portfolio-engine zawiera P01–P06; API/UI używają wspólnego ledgeru oraz ręcznych cen/FX. report-engine pozostaje szkieletem. Pozostałe tabele raportów/importu/dziennika są specyfikacją. Brak płatności, danych rynkowych na żywo i automatycznego pobierania raportów.

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
F11 zamknięte: pierwszy GitHub Actions przeszedł, w tym Playwright w Chromium. F12 ukończone: OpenAPI i testy kontraktów. P01–P07 i A01–A07 ukończone dla ręcznego MVP; następnie A08 — dziennik decyzji. Widoki inwestycji i gotówki sprawdzone na desktopie/mobile/dark; pełny audyt dostępności pozostaje przed pilotem. Zmieniaj README, backlog i HANDOFF po każdym etapie. Nie zaczynaj od płatności lub integracji AI. Historia Git została odtworzona lokalnie z bundle. Publiczne repozytorium: [nookieslaya/investorkit](https://github.com/nookieslaya/investorkit). Lokalnie na macOS potwierdzono build, typecheck,124 testy unit,42 integracyjne i3 E2E na Node24; szczegóły w raporcie weryfikacji.

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

Dane starsze niż ustawiony próg (domyślnie72h) są nieaktualne. Przy brakujących/starych danych pełna wartość i P/L są kreską, a osobno pokazana jest tylko wyceniona część. Przyszłe ceny/kursy nie są dopuszczane do zapisu ani używane do historycznej wyceny. Wpłaty netto≤0 dają brak procentu. Prosta stopa nie uwzględnia czasu przepływów; koszt średni jest analityczny, nie podatkowy. Kursy i ceny są wpisami użytkownika, bez notowań live.

API: GET/POST `/api/v1/instruments`, POST `/api/v1/instruments/:id/quotes`, POST `/api/v1/fx-rates`, GET/POST `/api/v1/portfolios/:id/operations`, GET `/api/v1/portfolios/:id/valuation?asOf=...`. OpenAPI obejmuje21 operacji. Limity tej wersji:100 instrumentów/użytkownika, 500 cen/instrument i1000 kursów wyceny/użytkownika. Dane są append-only, bez edycji/korekt i stronicowania w tym etapie.

## Symulator zakupu (P05/A06)
Wybierz **Symulacja zakupu** w nawigacji portfela: http://localhost:5173/#simulator. To osobny widok; formularz wpłat/wypłat, salda i historia są w **Operacjach** (`#operations`, także poprzedni link `#cash-operations`). Inwestycje pozostają w `#investments`. Wszystkie sekcje są dostępne również na telefonie.

Formularz zawiera instrument, budżet z prowizją, cenę zakupu, prowizję i źródło środków. Ostatnia aktualna cena ręczna domyślnie uzupełnia cenę zakupu, także dla instrumentu jeszcze nieposiadanego. Data i źródło są widoczne. Cena wpisana lub wyczyszczona przez użytkownika ma pierwszeństwo przy odświeżaniu danych; zmiana instrumentu przywraca jego własny wpis w obrębie otwartego formularza. Brak/stare/przyszłe ceny nie uzupełniają pola. Nowa pozycja bez notowań może użyć ceny zakupu jako jawnego założenia wyceny.

Główne wyniki to kupowana ilość, średni koszt przed→po z prowizją, udział przed→po z gotówką i pozostałe środki w walucie zakupu. Niżej jest wartość całego portfela po symulacji. Nowy instrument ma etykietę „Nowa pozycja”. Pełna tabela, rozliczenie dopłaty/cen/prowizji, wynik dokupowanej części, źródła/daty FX i zasady precyzji są w domyślnie zwiniętych **Szczegółach obliczeń**, dostępnych klawiaturą. Ostrzeżenia o brakach/starych danych i krótki komunikat o różnicy cen pozostają widoczne. Wynik w komunikacie uwzględnia prowizję i nie jest prognozą.

Wyświetlanie: pieniądze2 miejsca, procenty2, ilości maksymalnie6 bez końcowych zer i z „≈” przy przybliżeniu; dokładna ilość jest też w szczegółach. Średni koszt2 miejsca, więcej jeśli ukryłyby różnicę lub dodatnią wartość. Dodatnia reszta poniżej grosza to „<0,01” z walutą. Formatowanie HALF_EVEN działa na decimal strings/BigInt; nie liczymy scenariusza z zaokrąglonego UI.

Kurs hipotetycznej wpłaty/zakupu to aktualny ręczny FX (według ustawionego wieku, domyślnie72h), PLN=1. Nie ma automatycznej wymiany walut. Cena zakupu nie nadpisuje ceny wyceny. Istniejąca pozycja bez ceny oraz stare/przyszłe notowania zachowują diagnostykę i brak pełnej wyceny. Po zmianie danych ponów obliczenie. Symulacja nie zapisuje transakcji i nie zmienia portfela.

Silnik i istniejące16 kontraktów API zachowane. Jedyny dodatkowy odczyt to `GET /api/v1/instruments/:id/quotes`, potrzebny do podpowiadania cen także dla nieposiadanych instrumentów, z sesją i owner scope. `POST /api/v1/portfolios/:id/simulations` nadal używa spójnej transakcji READ ONLY. Bez nowych zależności, migracji i zapisu scenariuszy. Weryfikacja:124 unit,42 integration,3 E2E Chromium; szczegóły w VERIFICATION.md.

## Koncentracja i testy spadków (P06/A07)
Wybierz **Scenariusze spadków**: http://localhost:5173/#risk. Zobaczysz największą pozycję, Top3/5 oraz podział według typu aktywów, waluty notowania/gotówki i kraju emitenta. Mianownikiem jest cały portfel z gotówką; Top3/5 obejmuje same papiery. Nieznane kategorie pozostają widoczne i w mianowniku. Kraj emitenta/funduszu ETF nie oznacza ekspozycji geograficznej aktywów; waluta notowania nie opisuje całego ryzyka walutowego.

Test spadku od0 do100% obejmuje jedną otwartą pozycję albo wszystkie papiery. Gotówka i FX pozostają stałe. Wynik pokazuje wartość przed/po i ubytek; szczegóły zawierają ceny, daty i źródła FX. To scenariusz, nie prognoza, bez zapisu transakcji lub zmiany portfela. Brak/stare dane dają niedostępne pełne wartości i udziały, a nie pozornie kompletny wynik. Dla pustego/zerowego portfela procenty są niedostępne; dla samej gotówki Top3/5=0 i spadek papierów jej nie zmienia.

W rozwijanych ustawieniach zapiszesz własne progi (domyślnie25%/60%/80%, pozycja≤Top3≤Top5) i maksymalny wiek cen/FX (domyślnie72h, pełne godziny1–8760). Progi są ustawieniami produktu, nie uniwersalną oceną bezpieczeństwa. Świeżość działa spójnie także w Inwestycjach i Symulatorze. Dwa okna nie nadpiszą sobie ustawień: zapis wymaga aktualnej wersji. Sama analiza i testy niczego nie zapisują.

API: GET `/api/v1/portfolios/:id/risk`, GET/PATCH `.../risk-settings` (If-Match/revision), POST `.../stress-tests`. Migracja0003 dodaje wyłącznie tabelę ustawień i ograniczenia; zastosowana lokalnie po prywatnej kopii bazy. Dotychczasowe formaty wejścia/wyjścia17 operacji zachowane. Brak nowych zależności i zmian ledgeru.

### Uproszczona prezentacja scenariuszy — 16.11.2026
Przyciski 10%, 20% i 40% uzupełniają dodatnią wielkość spadku; nadal można wpisać własną wartość 0–100%. Wynik zaczyna się od krótkiego podsumowania wpływu na cały portfel, wartości przed → po i zmiany ze znakiem minus. Dla 0% komunikat jest neutralny. Scenariusz jednej pozycji pokazuje jej cenę, wartość PLN i udział przed → po; cały portfel ma podsumowanie zbiorcze. Pełna lista, ceny, źródła, daty i FX są w domyślnie zamkniętych „Szczegółach obliczeń”, dostępnych klawiaturą. Ostrzeżenia oraz założenia pozostają widoczne.

Edycja parametrów, zapis ustawień i odświeżenie danych (również automatyczne, bez zmiany odpowiedzi) usuwają poprzedni wynik. Spóźniona odpowiedź nie przywraca starego scenariusza. Dotychczasowe linki `#risk` i `#simulator` działają z nowymi etykietami nawigacji. Silnik, precyzja, API i dane bez zmian; bez nowych zależności. Kontrole:124 unit,42 integration,3 E2E, typecheck/build/OpenAPI oraz desktop/mobile w jasnym i ciemnym motywie; szczegóły w docs/VERIFICATION.md.

Historia gotówki ma cienki pasek przewijania z zarezerwowanym miejscem i odstępem od tekstu. Kwoty nie łamią się w środku; na telefonie są pod opisem. Przewijaną listę można wybrać klawiszem Tab i przewijać klawiaturą.

## Regresje finansowe P07 — 17.11.2026
Przegląd P02–P06 domknięty bez zmiany algorytmów, API, UI i danych użytkownika. Dodano17 testów jednostkowych (w tym18 kombinacji waluty/finansowania/skali ilości) i2 integracyjne. Sprawdzono uzgodnienie gotówki, kosztów i wyniku po BUY/SELL, legalne identyczne zakupy a ponowienia klucza, zerowe/ujemne wpłaty netto, ułamki poniżej skali zapisu, overflow i osobne granice świeżości. [Mapa golden1–7 i granic](docs/04-calculations.md#p07--przegląd-regresji-zakończony-17112026). Lokalnie124 unit,42 integration i3 E2E PASS, typecheck/build/OpenAPI PASS. Następny etap: A08, prywatny dziennik decyzji z owner scope i revision.
