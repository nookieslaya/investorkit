# Marketstack — weryfikacja i lokalna integracja

Stan: **18.11.2026 — integracja lokalna wdrożona i włączona; publiczne uruchomienie zablokowane licencją**. Rzeczywiste próby dostawcy wykonano17.11.2026. Testy implementacji zakończono18.11.2026.

## Potwierdzone odpowiedzi dostawcy

| Instrument | Symbol z katalogu | Giełda / MIC | Waluta EOD | has_eod | Nieskorygowany close | Data sesji |
|---|---|---|---|---|---|---|
| XTB S.A. | XTB.WA | GPW / XWAR | PLN | true | 139,72 | 2026-11-16 |
| Powszechna Kasa Oszczednosci Bank Polski Spólka Ak | PKO.WA | GPW / XWAR | PLN | true | 120,32 | 2026-11-16 |
| Orlen S.A. | PKN.WA | GPW / XWAR | PLN | true | 131,72 | 2026-11-16 |
| Apple Inc | AAPL | Nasdaq / XNAS | USD | true | 352,78 | 2026-11-16 |
| Vanguard Morningstar Total Stock Market ETF | VTI | NYSE Arca / ARCX | USD | true | 364,30 | 2026-11-16 |

Wszystkie powyższe katalogi i EOD zwróciły HTTP200. Symbole pochodzą z odpowiedzi, nie ze zgadywania sufiksów. Nazwy i tickery wyszukują wyniki. Cena, waluta, symbol, MIC i data zostały zweryfikowane w EOD — sam wpis XWAR i flaga has_eod nie były wystarczające.

Typ nie był dostępny w walidowanym katalogu/EOD. Nazwa ETF pochodzi od dostawcy; UI wymaga jawnego wyboru STOCK/ETF, nie zgaduje typu, ISIN ani kraju emitenta. Potwierdzenie dotyczy tych konkretnych notowań i dat, **nie wszystkich instrumentów GPW/USA/ETF**. Inne MIC i EUR są dopuszczane przez model, lecz ich pokrycia nie potwierdzono w tej próbie. Wynik wyszukiwania w aplikacji jest pokazywany dopiero po poprawnym EOD i potwierdzeniu waluty PLN/EUR/USD.

### Przebieg i budżet

1. Pierwsza próba:10 jednostek, w tym5 katalogów i5 EOD. Ujawniła nieobsługiwany początkowo format offsetu daty `+0000`; dodatkowy odczyt potwierdził cenę XTB. Pozostałych odrzuconych cen nie uznawano za zweryfikowane.
2. Uzupełnienie po poleceniu kontynuacji: **9/10 nowych jednostek** —1 kontrola katalogu PKO, następnie4 katalogi i4 EOD dla PKO/Orlen/Apple/VTI. Dowód XTB z poprzedniej próby wykorzystano ponownie bez nowego zapytania.
3. Razem **19 rzeczywistych operacji**. Bez pełnego katalogu, nieograniczonej paginacji, zakupów i zmian subskrypcji. Testy kodu/SQL/przeglądarki korzystały z fixtures i nie wykonywały kolejnych wywołań Marketstack.

Kontrola PKO wyjaśniła odrzucenie: wynik `PKO` zawiera fundusze, bank i rekord z pustą nazwą, a strona jest ucięta (13 wyników, limit10). Pusta nazwa nie powinna psuć pozostałych rekordów. Parser katalogu przyjmuje taki rekord, ale nie wybiera go jako kandydata. Dokładniejsze zapytanie **Powszechna Kasa** zwróciło jednoznaczny bank PKO.WA; nie wybierano automatycznie pierwszego funduszu ani dopasowania wyłącznie po tickerze.

Brak klucza, pusta odpowiedź, odmowa planu, ogólne403, auth/quota,404, błąd schematu i błąd sieci są rozróżniane w diagnostyce.403 nie oznacza braku obsługi GPW. W rzeczywistych próbach nie wystąpiły odmowy planu/auth/quota. **Plan konta i faktyczny licznik rozliczeń pozostają nieustalone** — nie odczytywano panelu dostawcy. [FAQ](https://marketstack.com/faq) opisuje naliczanie per symbol; lokalna rezerwacja jest ostrożniejsza i liczy także błędy oraz retry. [Cennik](https://marketstack.com/pricing) wskazywał Free100/miesiąc; nie zastępuje to danych konkretnego konta.

Dowody pozostają prywatne w ignorowanym .local-backups: marketstack-diagnostic-first-run.json, marketstack-xtb-inspection.json, marketstack-pko-inspection.json i marketstack-followup.json. Sekret nie znajduje się w tych raportach ani repozytorium.

## Zaimplementowane możliwości

- Backendowy adapter `MarketDataProvider`, wymienialny bez przebudowy silnika. Native fetch, stały host HTTPS, bez redirectów, timeout4s, Zod i maksymalnie1 retry tylko dla błędu sieci/5xx. Bez retry auth/quota/plan/schematu. Bez raw errors, wiadomości dostawcy lub logowania URL z kluczem.
- **Precyzja:** Node24 JSON reviver pobiera oryginalny leksykalny tekst `close`, zanim cena zostanie użyta jako wartość Number. Walidacja do obecnych18+10 cyfr, brak cichego zaokrąglenia; wartości spoza kontraktu odrzucane. `adj_close` nie zastępuje `close`. Test 99999999999999999.1234567890 potwierdza zachowanie cyfr. Silnik finansowy nie wykonuje nowych obliczeń ani konwersji binarnych.
- `market_bindings` zapisuje jawne mapowanie właściciel/instrument/symbol/MIC/waluta i źródło manual/marketstack. Bez automatycznego mapowania istniejących tickerów i bez podmiany raz wybranego notowania innym. Waluta i MIC muszą odpowiadać instrumentowi.
- `market_quotes` przechowuje osobno cenę, instrument, symbol, MIC, walutę, źródło, datę sesji, timestamp dostawcy `asOf` i czas pobrania `fetchedAt`. Dostawca zwracał timestamp sesji o północy; nie deklarujemy znajomości rzeczywistej godziny zamknięcia. Data sesji nie jest zastępowana czasem pobrania. Pole modelu fetchedAt korzysta z kolumny created_at.
- Ceny automatyczne są oddzielone od manual_quotes i izolowane per właściciel. Wybrane źródło **wyłącza drugie** w bieżącej wycenie; nie ma ukrytego fallbacku na cenę o innej semantyce. Powrót do źródła manual przywraca dotychczasowe wpisy. Koszty/FX transakcji i dawne snapshoty nie są zmieniane.
- Wyszukiwanie:600ms debounce, minimum3 znaki, jawny MIC, do3 wyników, waluta potwierdzana EOD, prywatny cache15min. Zwykle do4 jednostek przed retry. Niejednoznaczne lub częściowe wyniki wymagają wyboru/doprecyzowania. Puste/nieweryfikowalne dane nie stają się ceną0. Typ do potwierdzenia przez użytkownika. Ręczne dodawanie nadal działa.
- Trwały atomowy licznik `market_budget`: domyślnie60/miesiąc UTC, wspólny dla procesów i użytkowników klucza, rezerwacja przed I/O również dla retry/porażek. Auth/quota blokują dalsze żądania w tym miesiącu. To limit **aplikacji**, nie odczyt limitu pozostałego u dostawcy. Diagnostyczny CLI ma osobny limit1–10 na przebieg i nie jest wliczany do tego licznika.
- Dzienny job w procesie API tylko dla jawnie zmapowanych otwartych pozycji. Domyślnie po19:00UTC (20:00 zimą/21:00 latem w Polsce), sprawdzenie co minutę, maksymalnie jedna próba dziennie UTC/instrument, także po porażce. Blokada wiersza chroni procesy i równoczesne ręczne odświeżenia, unikalność notowania zapobiega duplikatom. Niedziałający proces nie uruchamia joba; po starcie po ustawionej godzinie może wykonać bieżącą próbę. Nie odtwarza pominiętych dni.
- Harmonogram jest **konserwatywną godziną sprawdzenia ostatniej opublikowanej sesji**, nie gwarancją publikacji najnowszej sesji tego dnia. Dane z16.11 były faktycznie dostępne17.11 o18:07UTC; nie potwierdzono SLA publikacji per giełda. Wybór instrumentu korzysta z EOD z wyszukiwania i liczy tę próbę jako dzisiejszą, aby nie pobierać powtórnie tego samego zestawu.
- „Odśwież wycenę” aktualizuje zmapowane pozycje z zachowaniem tych limitów, a potem przelicza portfolio; „Odśwież EOD” działa per instrument. Przy błędzie stara cena/data pozostają, próba ma osobny widoczny status. Nie przyznaje to starej cenie nowej świeżości.
- UI: od19.11 wyszukiwanie i dodawanie/mapowanie są w „Uzupełnij swój portfel → Instrument”, z ręcznym formularzem na żądanie (bez rozwijania przy wyłączonym dostawcy). Panel Ceny dzienne · Marketstack zarządza źródłem, pokazuje cenę zamknięcia z datą, czas pobrania i ostatniej próby oraz limit aplikacji. Źródła poprawnie opisane także w symulatorze, ryzyku i historii. Świeżość nadal według ustawionego progu; weekend sam w sobie nie jest awarią. Brak FX daje niepełną wycenę PLN.

## Uruchomienie i granice lokalne

```bash
npm run db:migrate
npm run dev
# Osobna diagnostyka (każdy przebieg zużywa nowy budżet):
npm run marketstack:diagnose
```

Wyłącznie w ignorowanym backendowym .env:

```dotenv
MARKETSTACK_API_KEY=<prywatny-klucz>
MARKETSTACK_ENABLED=true
MARKETSTACK_MONTHLY_BUDGET=60
MARKETSTACK_DAILY_UTC_HOUR=19
MARKETSTACK_DIAGNOSTIC_BUDGET=10
```

Domyślnie .env.example wyłącza integrację. W lokalnej aplikacji użytkownika włączono ją18.11.2026; GET/market z istniejącą sesją zwrócił200, enabled:true, used:0, limit:60, mapowań:0. Istniejących pozycji **nie mapowano automatycznie**. Nie dodawano transakcji ani testowych danych finansowych na bazie aplikacji. Migracja0006 CREATE-only zastosowana na testowej i lokalnej bazie po prywatnym pg_dump600; lista backupu sprawdzona. Testy używały wyłącznie investorkit_contract_test.

Parser konfiguracji odrzuca włączenie z NODE_ENV=test/production lub bez klucza. Publiczne uruchomienie pozostaje **BLOCKED** do potwierdzenia praw SaaS, wyświetlania, retencji i współdzielonego cache. Cache jest prywatny per właściciel; brak redystrybucji. Hasło Commercial Use nie jest potwierdzeniem tych praw. [Dokumentacja](https://docs.apilayer.com/marketstack/docs/api-documentation), [Quickstart](https://docs.apilayer.com/marketstack/docs/quickstart-guide), [kontrakt V2](https://docs.apilayer.com/marketstack/docs/marketstack-api-v2-v-2-0-0), [warunki APILayer](https://www.ideracorp.com/legal/APILayer).

## Kontrole18.11.2026

PASS:157 unit/14 plików,65 integration/8 plików na PostgreSQL,6 E2E Chromium, build:packages/typecheck/build/openapi:check, frontend/backend noUnused i diff-check. Testy obejmują precyzję close, błędy, budget-before-I/O/restart, cache/owner scope, źródło, currency/MIC, datę/stale/missing FX, concurrent refresh+job, brak duplikatów, zachowanie starej ceny, wygasłe wybory oraz UI debounce/klawiaturę/źródła.

Provider w unit/integration jest fixture; test nowego UI również symuluje odpowiedzi Marketstack, natomiast konto/portfel/instrument korzystają z testowego API/DB. To nie kolejne dowody rzeczywistego pokrycia dostawcy. Zrzuty1280/390 light/dark obejrzane, brak poziomego overflow. Dawne28 kontraktów zachowane poza addytywnym źródłem marketstack w wycenach;5 nowych operacji =>33. Algorytmy i precyzja silnika bez zmian. Znane ostrzeżenie bundle>500kB pozostaje.
