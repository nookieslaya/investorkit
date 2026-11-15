# Kontrakty API v1
Status: specyfikacja docelowa; wdrożone endpointy wymienia README. Wspólne Zod DTO są źródłem kontraktu, OpenAPI generowane w zadaniu F12. JSON decimal jako string z kropką, bez separatorów tysięcy i notacji naukowej. Daty ISO8601 UTC. Kwoty ≤18 cyfr całkowitych, ≤10 ułamkowych; reject zamiast cichego obcięcia. currency enum PLN/EUR/USD.

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
