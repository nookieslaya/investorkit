# Kontrakty API v1
Status: specyfikacja docelowa; wdrożone endpointy wymienia README. Wspólne Zod DTO są źródłem kontraktu. Wdrożony zakres opisuje generowany [OpenAPI 3.0.3](openapi.json); tabela poniżej nadal obejmuje także funkcje planowane. JSON decimal jako string z kropką, bez separatorów tysięcy i notacji naukowej. Daty ISO8601 UTC. Kwoty ≤18 cyfr całkowitych, ≤10 ułamkowych; reject zamiast cichego obcięcia. currency enum PLN/EUR/USD.

Sesja cookie; state-changing requests wymagają zgodnego Origin (lub osobnej uwierzytelnionej ścieżki CLI w przyszłości). Odpowiedź listy {items,nextCursor}; limit domyślny25/max100, cursor opaque. Błąd {error:{code,message,requestId,issues?}}. 400 walidacja, 401 brak sesji, 404 brak/cudzy zasób, 409 konflikt, 413 limit, 422 błąd domeny, 429 limit, 503 brak zależności. Nie ujawniać zapytań SQL/stack. PATCH używa revision/If-Match, konflikt409.

| Metoda/ścieżka | Wejście / wynik |
|---|---|
| GET /health | {status:ok}; liveness bez DB |
| GET /ready | 200 gdy SELECT1 działa, inaczej503; bez szczegółów DB |
| GET/POST /api/auth/* | Handler Better Auth; nie własny protokół haseł |
| GET /api/v1/me | {id,email,name} |
| GET /api/v1/portfolios | {items:[{id,name,baseCurrency,createdAt}]} |
| POST /api/v1/portfolios | {name,baseCurrency:PLN} →201 portfolio; unikalność właściciela w DB |
| GET /api/v1/portfolios/:id | portfolio albo404 po owner scope |
| POST /api/v1/instruments | {type,symbol,mic,name,currency,isin?,issuerCountry?,quantityScale} →201 |
| POST /api/v1/portfolios/:id/operations | discriminated union BUY/SELL/DEPOSIT/WITHDRAWAL; Idempotency-Key wymagany; →201 operacja |
| GET /api/v1/portfolios/:id/operations | cursor/limit/from/to → lista |
| POST /api/v1/instruments/:id/quotes | {price,currency,asOf,source:manual} →201 |
| POST /api/v1/fx-rates | {currency,baseCurrency:PLN,rate,asOf,source:manual} |
| GET /api/v1/portfolios/:id/valuation | ?asOf → {complete,totalValue,pricedSubtotal,netContributions,pnl,pnlPct,positions,cash,valuationRange,missing,stale,engineVersion} |
| GET /api/v1/portfolios/:id/history | from/to → tylko rzeczywiste snapshots, luki jawne |
| POST /api/v1/portfolios/:id/simulations | {instrumentId,budget,unitPrice,commission,funding:NEW_MONEY/EXISTING_CASH} → {assumptions,before,after,delta,remainingCash} |
| GET/PATCH /api/v1/portfolios/:id/risk-settings | threshold decimal strings 0..100; quote/fx max age |
| POST /api/v1/portfolios/:id/stress-tests | {scope:INSTRUMENT/SECURITIES,instrumentId?,dropPct} → before/after/loss/assumptions |
| GET/POST /api/v1/portfolios/:id/journal | list lub {instrumentId,decidedAt,reason,horizon,thesis,risks,reviewConditions,notes}; tekst plain, limity 500–10000 znaków |
| PATCH/DELETE /api/v1/journal/:id | revision, owner scope |
| POST /api/v1/portfolios/:id/imports/preview | multipart CSV ≤5MiB/10000 wierszy, adapterId, mapping → {batchId,rows,errors,duplicates,canCommit,blockedReason} |
| POST /api/v1/imports/:id/commit | {previewRevision} → batch status/counts; atomowo, brak błędnych wierszy |
| POST /api/v1/documents | multipart PDF ≤10MiB/100stron →202 {documentId,status} |
| POST /api/v1/documents/from-url | {url,instrumentId?} →202; bezpieczny fetch job |
| POST /api/v1/documents/:id/analyses | {profile:default}; model wybiera serwer →202 {jobId} lub200 cache hit |
| GET /api/v1/analysis-jobs/:id | status,analysisId?,errorCode? |
| GET /api/v1/analyses/:id | {facts,interpretations,citations,model,promptVersion,costUsd,costStatus,createdAt} |
| GET /api/v1/documents | lista dozwolonych dokumentów z historią analiz |
| POST /api/v1/interest | {email,consentVersion}; neutralna202, rate limit, bez ujawniania istniejących maili |

Przykład BUY:
```json
{"kind":"BUY","instrumentId":"uuid","occurredAt":"2026-11-15T12:00:00Z","quantity":"0.125","unitPrice":"80","commission":"0.5","currency":"USD","fxToBase":"4"}
```
Idempotency-Key: scoping użytkownik+portfel+endpoint; ponowienie tego samego body zwraca ten sam wynik, inne body przy tym kluczu409. Hash body i status odpowiedzi przechowywane atomowo z operacją. Transakcyjna blokada portfela zapobiega równoległemu wydaniu tej samej gotówki.

## Wdrożony OpenAPI (F12)

`GET /api/v1/openapi.json` udostępnia dokument bez sesji, pod globalnym limitem żądań i z `Cache-Control: no-store`. Lokalnie: http://localhost:5173/api/v1/openapi.json. Dokument obejmuje szesnaście operacji; bazowy zakres to: GET /health, GET /ready, GET/POST /api/v1/portfolios, GET /api/v1/portfolios/{id} oraz opisane poniżej operacje gotówkowe i inwestycyjne opisane poniżej. Nie deklaruje planowanych endpointów jako wdrożonych. Endpoint dokumentacji opisany jest w metadanych, bez rekurencyjnego schematu własnej odpowiedzi.

Rejestr operacji: `apps/api/src/openapi.ts`; schematy body/parametrów/odpowiedzi pochodzą z `packages/shared`. Konwersja natywna `z.toJSONSchema` (https://zod.dev/json-schema), target `openapi-3.0`: wejście `io: input` zachowuje opcjonalne `baseCurrency` z domyślnym PLN; odpowiedzi `io: output` wymagają wszystkich pól. Nazwa jest przycinana przed walidacją długości w Zod; JSON Schema nie wykonuje normalizacji tekstu.

`npm run build:packages`, potem `npm run openapi:generate` aktualizuje `docs/openapi.json`; `npm run openapi:check` i test unit wykrywają nieaktualny dokument (także w CI). Po zmianie handlera należy zaktualizować rejestr operacji i testy. Kontrakty odpowiedzi testowane są niezależnym walidatorem JSON Schema Fastify, bez koercji, usuwania pól i uzupełniania domyślnych wartości.

Portfele wymagają cookie Better Auth (prefiks `__Secure-` w produkcji) i zgodnego Origin dla POST. Handler `/api/auth/*` zachowuje protokół Better Auth, nie standardowy envelope błędów aplikacji; nie jest objęty tym dokumentem. Lista portfeli obecnie zwraca wyłącznie `{items}` bez cursor/limit. `/ready` zwraca osobne `{status: unavailable}` przy 503. Pozostałe błędy własnych endpointów używają wspólnego envelope; komunikaty i identyfikatory żądań nie zawierają SQL ani sekretów.

## Wdrożone P03 — gotówka
- GET /api/v1/portfolios/{id}/cash → balances[{currency,amount}], netContributionsBase, baseCurrency=PLN, operationCount. To stan gotówki i historycznych przepływów, nie wycena portfela.
- GET /api/v1/portfolios/{id}/cash-operations → {items,limit:1000}; najnowsza occurredAt/sequence pierwsza, maksymalnie1000 wpisów na portfel w tej wersji (kolejny zapis422). Bez paginacji i edycji na tym etapie.
- POST /api/v1/portfolios/{id}/cash-operations: Idempotency-Key UUID i {kind:DEPOSIT/WITHDRAWAL,currency,amount,occurredAt,fxToBase,fxAsOf,fxSource:manual,note?}. DatyUTC, kwota≤18/10, kurs≤16/12; kwota i FX dodatnie, PLN FX1. Własność z sesji. 201 zawiera id,createdAt oraz pola operacji; bez ownerId,hash,key. Powtórzenie tego samego klucza i znormalizowanego body zwraca tę samą201; inne body409. Normalizacja kwoty/kursu i dat jest deterministyczna. 422: debet na dowolnym prefiksie, przyszła data, błędny FX, overflow lub limit historii. Standardowe400/401/403/404/413/415/429/500 jak w OpenAPI.

Zapisy wymagają transakcji i blokady portfela; nie ma fallback FX1 dla walut obcych. Pola przyszłego endpointu pełnych operacji BUY/SELL nie są przyjmowane przez ten kontrakt.

## Wdrożone P04 — instrumenty, transakcje i wycena
- GET/POST /api/v1/instruments: lista / tworzenie instrumentu STOCK/ETF. Zod strict, symbol uppercase, MIC4, quantityScale0–10, currencyPLN/EUR/USD, opcjonalny ISIN/kraj (format). Własność z sesji. Duplikat owner+symbol+MIC+currency409, limit100/użytkownika422. Brak edycji.
- POST /api/v1/instruments/{id}/quotes: {price,currency,asOf,source:manual}; 201{id,instrumentId,createdAt,...}. Cena≥0, waluta instrumentu, przyszła data422, cudzy/brak instrument404, limit500 cen/instrument422. Append-only.
- POST /api/v1/fx-rates: {currency,baseCurrency:PLN,rate,asOf,source:manual}; 201 rekord. Rate>0 do16/12, PLN=1, data≤teraz, limit1000 kursów/użytkownika. To kurs wyceny, nie aktualizacja historycznego FX ledgeru.
- GET /api/v1/portfolios/{id}/operations: wspólna historia4 typów, od najnowszej occurredAt/sequence, limit1000 łącznie. Cash alias filtruje wyłącznie wpłaty/wypłaty; salda cash uwzględniają wszystkie przepływy.
- POST /api/v1/portfolios/{id}/operations: DEPOSIT/WITHDRAWAL lub BUY/SELL. BUY/SELL zawiera instrumentId,currency,quantity,unitPrice,commission,commissionCurrency,occurredAt,fxToBase,fxAsOf,fxSource=manual,note?. Currency i feeCurrency muszą odpowiadać instrumentowi. Wspólny lock/idempotencja/replay; 422 dla debetu, oversell, nieprawidłowych jednostek/dat/overflow. 404 dla cudzego instrumentu. Nie ma fallback FX1 dla walut obcych. Idempotency-Key per portfolio jest wspólny z cash aliasem, z zachowaniem starych hashy P03.
- GET /api/v1/portfolios/{id}/valuation?asOf=UTC: default zegar serwera; przyszły query422, błędny query400. 200 zawiera complete,totalValue|null,pricedSubtotal,netContributionsBase,pnl|null,pnlPct|null,pnlPctReason,realizedBase,positions,cash,valuationRange,progi72h,asOf,engineVersion. Każda pozycja ma koszty, wartość/P&L/udział lubnull oraz wybraną cenę/FX, źródło i diagnostykę. Przy niepełności nie ma pełnej wartości/wyniku. Wycena jest czytana na spójnym snapshotcie REPEATABLE READ; nie korzysta z ceny zakupu jako ceny aktualnej. Quote/FX future względem wybranego asOf są wykluczone.

OAS3: nullable enum musi także jawnie zawieraćnull w enum; generator uwzględnia tę regułę (np. pnlPctReason). Testy JSON Schema sprawdzają kompletne i niekompletne odpowiedzi, bez łagodzenia walidacji. OpenAPI ma16 operacji własnych; Better Auth poza tym protokołem.

## Wdrożone P05/A06 — symulacja
`POST /api/v1/portfolios/{id}/simulations` wymaga sesji i zgodnego Origin. Ścisłe body: `{instrumentId,budget,unitPrice,commission,funding:"NEW_MONEY"|"EXISTING_CASH"}`; kwoty jako decimal strings18/10. Cały budżet obejmuje prowizję; cena>0, fee≥0, zakupiona ilość>0 i zgodna ze skalą instrumentu. Dla EXISTING_CASH cały budżet musi mieć pokrycie we własnym subkoncie waluty. Instrument i portfel muszą należeć do sesji, inaczej404.

Odpowiedź200: assumptions (wejście, waluta/skala, referencyjna cena/źródło/data lubnull, wybrany FX/źródło/data), quantity, actualCost, budgetRemaining, remainingCash, before/after (pełne kontrakty wyceny), delta.totalValue/positionValue lubnull przy braku wyceny. actualCost/budgetRemaining/remainingCash zachowują precyzję obliczeń; pieniądze w wycenie/delta mają końcowe HALF_EVEN10. Delta jest liczona przed zaokrągleniem snapshotów, więc ostatnia cyfra może różnić się od odejmowania wyświetlonych kwot.

Kurs hipotetycznych operacji to aktualny własny FX wyceny≤72h (PLNidentity1). Brak/stary/przyszły FX waluty zakupu422 SCENARIO_FX_REQUIRED, bez domyślnego1. Nowa pozycja bez żadnych zapisanych cen używa ceny scenariusza ze źródłem `scenario`; źródło to istnieje wyłącznie w odpowiedzi/silniku, zapis ceny nadal dopuszcza tylko `manual`. Brak ceny już posiadanej pozycji lub stare/przyszłe rekordy pozostają diagnostyką, bez zastępowania. Braki pozostałego portfela zachowują niepełność i udziałynull.

Zegarem scenariusza jest czas serwera. Cały odczyt jest spójny REPEATABLE READ / READ ONLY; brak INSERT/UPDATE/DELETE oraz klucza idempotencji. Powtórzenia obliczają bieżący stan, nie zapisują wpłat, BUY, cen ani kursów. Błędy400/401/403/404/413/415/422/429/500 w OpenAPI; za mały budżet422 BUDGET_TOO_SMALL, brak salda422 INSUFFICIENT_CASH. Brak zapisu scenariusza i automatycznej konwersji walut.

Doprecyzowanie wyniku P05: odpowiedź200 zawiera także `impact:{newMoneyBase,commissionBase,priceDifferenceBase,netEffectBase,netEffectPct}`. Kwoty bazowe wPLN, prowizja jako dodatni koszt, dopłata jako dodatni przepływ lub0. Różnica cen i wynik dokupowanej części są signed|null; procent liczony względem faktycznego kosztu z prowizją, bez dopłaty kapitału w liczniku. Brak aktualnej referencji kupowanego instrumentu daje null, również gdy rekord referencyjny istnieje, ale jest stale. Pozostałe endpointy i wejście symulacji bez zmian. Wycena/przepływy i ceny nadal pochodzą z tego samego spójnego odczytu; brak zapisów.
