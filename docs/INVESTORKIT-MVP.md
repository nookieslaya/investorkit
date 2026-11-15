# InvestorKit — pełna specyfikacja MVP

Wersja0.1 · 15.11.2026. Zakres docelowy MVP; stan implementacji opisany w README i VERIFICATION.

# InvestorKit — specyfikacja MVP
Wersja 0.1 · 15.11.2026 · status: projekt do pilotażu, nie gotowy SaaS.

## Propozycja wartości
„Wiesz, ile naprawdę masz, skąd bierze się wynik i jak kolejny zakup zmieni Twój portfel”. Polski interfejs, jawne kursy i daty wycen, prosty symulator oraz dziennik uzasadnień decyzji. Pierwszy segment: osoby z 3–20 pozycjami w XTB, akcje i ETF-y w PLN/EUR/USD. To hipoteza segmentu do wywiadów.

## Zakres i kolejność dostarczenia
MVP-A (pierwszy pilot): konto, jeden portfel PLN, ręczne instrumenty/notowania/kursy, operacje, gotówka, dashboard, symulator, koncentracja i dziennik. MVP-B: bezpieczny import XTB po weryfikacji próbki, prywatne PDF/URL i analiza AI. Cały brief obejmuje A+B; podział jest kolejnością realizacji, nie usunięciem wymagań.
Free: jeden portfel i podstawowe funkcje ręczne. Uprawnienia premium przewidziane w serwisie limitów, bez billing SDK. W pilotażu import i AI sterowane flagami oraz limitami. Cena 19/29 zł to hipotezy, nie opublikowany cennik.
Poza MVP: transakcje u brokera, podatek/PIT, shorty, CFD, opcje, margin, live market data, automaty raportowe, płatności, ETF look-through, prognozy, rekomendacje kup/sprzedaj. Historia wycen wyłącznie dla dni z danymi; brak sztucznie generowanego wykresu.

## Historie i kryteria akceptacji
| ID | Historia | Kryterium zakończenia |
|---|---|---|
| US01 | Zakładam konto i wracam do danych | Sesja HttpOnly; wylogowanie unieważnia sesję; użytkownik B nie odczyta ani nie zmieni zasobów A |
| US02 | Tworzę portfel | Jeden portfel Free egzekwowany transakcyjnie w API; baza PLN; nazwa 1–80 znaków |
| US03 | Dodaję akcję/ETF | Nazwa, symbol, giełda/MIC, typ, waluta; ISIN i kraj opcjonalne; sam ticker nie identyfikuje instrumentu |
| US04 | Rejestruję gotówkę i obrót | DEPOSIT, WITHDRAWAL, BUY, SELL; prowizja w walucie transakcji; brak ujemnej gotówki/shortów; zapis atomowy |
| US05 | Aktualizuję wycenę | Cena i timestamp, źródło manual; kurs każdej obcej waluty; brak kursu oznacza niekompletny wynik |
| US06 | Rozumiem wynik | Oddzielnie wpłaty netto, koszt otwartych pozycji, wynik zrealizowany/niezrealizowany i wynik portfela; nazwy miar w UI |
| US07 | Sprawdzam zakup | Nowe środki albo posiadana gotówka; uwzględnienie prowizji, FX i precyzji ilości; brak zapisu rzeczywistej transakcji |
| US08 | Widzę koncentrację | Top 3/5, udziały, kraj emitenta i waluta notowania; „nieznane” pozostaje w mianowniku; progi konfigurowalne |
| US09 | Testuję spadki | Zakres 0–100%, cena i FX bazowe jawne; „scenariusz, nie prognoza”; gotówka bez szoku akcyjnego |
| US10 | Zapisuję tezę | Data, powód, horyzont, teza, ryzyka, warunki rewizji, notatki; prywatne dla konta |
| US11 | Importuję CSV | Podgląd, mapowanie, błędy wierszy, confirm; drugi import nie tworzy duplikatów; bez próbki adapter XTB zablokowany |
| US12 | Czytam analizę raportu | Fakty z cytatem i fizyczną stroną PDF, interpretacje osobno, koszt i status; brak danych = brak twierdzenia |

## UX
Onboarding: konto → portfel → wpłata → instrument → BUY → wycena/kurs → pierwszy wynik. Dashboard: wartość i kompletność wyceny, wpłaty netto, P/L, pozycje, koncentracja, ostatnie operacje. Nawigacja: Przegląd / Operacje / Symulator / Dziennik / Raporty. Formularze z etykietami i błędami powiązanymi aria-describedby; klawiatura i widoczny focus; kontrast AA; kolory nie są jedynym nośnikiem wyniku. Jasny/ciemny/systemowy motyw, responsywność od 360 px. Cel WCAG 2.2 AA wymaga audytu, nie deklarujemy zgodności na podstawie komponentów.
Stany: loading, pusty portfel, brak sesji, błąd, offline, brak kursu, stara/częściowa wycena, raport w kolejce, limit AI, brak tekstu/OCR. Nie pokazujemy przykładowych liczb jako danych użytkownika.


---

# Architektura i decyzje

## Modularny monolit
apps/web (React, Vite, Router, Query) → apps/api (Fastify, Better Auth, usługi) → PostgreSQL (Drizzle). Jeden origin produkcyjny: /api proxy do backendu; Vite proxy w development. Cookies sesyjne zamiast JWT w localStorage. Wersjonowanie API /api/v1; Better Auth /api/auth.

| Katalog | Odpowiedzialność | Dozwolone zależności lokalne |
|---|---|---|
| apps/web | UI, routing, query cache, formatowanie | shared |
| apps/api | auth, autoryzacja, use cases, transakcje, adaptery | db, shared, portfolio-engine, report-engine |
| packages/db | schemat, migracje, połączenie | brak |
| packages/shared | Zod DTO, kody błędów, publiczne typy | brak |
| packages/portfolio-engine | czyste obliczenia decimal, deterministyczne wejście/wyjście | brak frameworków i DB |
| packages/report-engine | kontrakty ekstrakcji i analizy, cytowania i budżety | shared |

npm workspaces bez Nx/Turbo: obecna skala nie uzasadnia dodatkowego orchestratora. Node 24 LTS, TypeScript strict/noUncheckedIndexedAccess. Biblioteki przypięte dokładnie po odczycie registry; lockfile musi być wygenerowany po udanej instalacji. Registry ma pierwszeństwo przy wyborze stabilnego wydania, dokumentacja przy integracji. Brak instalacji = niepotwierdzona zgodność.

## Granice i zapis
Zod na wejściu API, konfiguracji, imporcie, odpowiedzi modelu i klienta HTTP. Decimal jako string w JSON i numeric w DB, nigdy JS number jako wejście pieniężne. UI może zamienić wynik na number jedynie do wykresu, bez zwrotnego użycia w silniku. Backend przelicza wynik; nie ufa wynikom klienta. Transakcja DB blokuje portfel SELECT FOR UPDATE przy mutacji ledgeru; po operacji odtwarza stan i sprawdza gotówkę/ilości. Wsteczna operacja przebudowuje wszystkie późniejsze stany. Zmiana kolejności nie może ukryć ujemnych stanów pośrednich.

## Decyzje ADR
| ID | Decyzja | Powód / kompromis |
|---|---|---|
| D01 | Jeden proces API, później worker tego samego kodu | Niski koszt; PDF/AI nie blokuje requestu; kolejka PostgreSQL bez Redis |
| D02 | Decimal.js, precision 40, HALF_EVEN | Kwoty i ułamki bez błędów binarnych; trzeba jawnie określić granice zaokrągleń |
| D03 | Średni ważony koszt dla analityki | Czytelny symulator; nie jest ewidencją podatkową FIFO |
| D04 | Ręczne wyceny i FX | Brak kosztu i licencji feedu; wymaga komunikatów o świeżości |
| D05 | Brak RLS w foundation | Mniej złożoności sesji connection pool; owner scope obowiązkowy w repozytoriach i testach |
| D06 | Rejestr operacji jako źródło prawdy | Pozycje/gotówka są projekcją; łatwiejszy audyt i przebudowa |
| D07 | Instrumenty i notowania prywatne w MVP | Ręczna cena A nie wpływa na B; później wspólny licencjonowany katalog |
| D08 | Prywatny PDF domyślnie | Sam URL/hash nie oznacza prawa do udostępnienia analizy |
| D10 | Jeden portfel egzekwowany indeksem w pilotażu | Premium multiportfolio wymaga migracji usuwającej unique(owner_id) i transakcyjnego serwisu limitów |
| D09 | i18n przez słownik i Intl | Polski MVP; bez pełnego frameworka tłumaczeń na start |

## Uruchomienie i CI
Docker Compose dla PostgreSQL 17, port tylko localhost, healthcheck, trwały wolumen. Aplikacje developerskie na hoście. CI: npm ci, typecheck, unit, build; osobny job PostgreSQL + migracje + integration; Playwright Chromium + realne API + DB. Migracje generowane i przeglądane, nigdy push schema na produkcji. Osobny deployment migration job; użytkownik runtime DB bez uprawnień DDL. Konfiguracja przez env, secret wyłącznie backend.

## Bezpieczeństwo / operacje
Auth Better Auth email/password, scrypt zarządzany przez bibliotekę, sesja 7 dni/odświeżenie 1 dzień, secure w produkcji, SameSite=Lax, CSRF/origin check, dokładna allowlista origin, bez trustProxy bez zaufanego proxy. Każdy zasób: owner_id z sesji; cudzy identyfikator → 404. Nie przyjmować owner_id z body. Globalny rate limit oraz ostrzejszy na auth/upload/AI; jeden proces na pilota, przed skalowaniem wspólny store limitów. Logi bez cookies, tokenów, haseł, treści PDF i tez. Request ID i kody błędów; stack tylko w logu serwera. Bez klucza OpenAI w Vite env.
Przed publicznym pilotem: weryfikacja email, reset hasła z jednorazowym tokenem i dostawcą maila, usunięcie/eksport konta, polityka prywatności i retencji, testy izolacji. Bez tego foundation to środowisko lokalne, nie gotowy publiczny auth.
Backup: codzienny szyfrowany pg_dump poza hostem, retencja 30 dni; blobstore wersjonowany; kwartalny restore drill w odizolowanym środowisku; cel RPO 24 h/RTO 4 h do pomiaru. Dziennik zdarzeń technicznych 30 dni; surowe importy usuwane po 7 dniach; dokumenty do usunięcia konta lub żądania; retencja kopii jawna w polityce. Skasowanie konta usuwa prywatne pliki i analizy; publiczne dopuszczone raporty nie zawierają identyfikatora użytkownika.


---

# Model danych
Status: pełny model docelowego MVP; foundation implementuje auth i portfolios. Pozostałe tabele wymagają osobnych migracji i testów zgodnie z backlogiem.

## Konwencje
PK UUID dla domeny; auth text IDs zgodne z Better Auth. timestamptz UTC, UI Europe/Warsaw. numeric(28,10): ceny, ilości, opłaty; FX numeric(28,12); koszty AI USD numeric(18,8). API wyłącznie string decimal. CHECK wartości dodatnie/nieujemne; quantity scale instrumentu ≤10. Zdarzenia mają occurred_at i stabilny sequence, created_at, created_by. Obliczenia wewnętrzne precision 40, zaokrąglenie dopiero do precyzji przechowywania/prezentacji.

| Tabela | Pola istotne / ograniczenia |
|---|---|
| user/session/account/verification | Schemat Better Auth, unique email/token, session.user_id FK, expires_at i indeksy; cascade konta/sesji |
| portfolios | id, owner_id→user, name, base_currency=PLN, created_at, updated_at; index owner; unique(owner_id) dla jednego portfela pilota |
| instruments | id, owner_id, type STOCK/ETF, symbol, mic, isin?, name, quote_currency, issuer_country?, quantity_scale; unique(owner_id,symbol,mic,currency); unique(id,owner_id) |
| portfolio_operations | id, owner_id, portfolio_id, instrument_id?, kind, occurred_at, sequence, quantity?, unit_price?, amount?, currency, commission, fx_to_base, provenance, idempotency_key?, revision; unique(portfolio_id,sequence), unique(portfolio_id,idempotency_key); check pól per rodzaj |
| manual_quotes | id, owner_id, instrument_id, price, currency, as_of, created_at, source=manual; index(owner_id,instrument_id,as_of desc) |
| fx_rates | id, owner_id, quote_currency, base_currency, rate, as_of, source; unique(owner_id,quote_currency,base_currency,as_of) |
| journal_entries | id, owner_id, portfolio_id, instrument_id, decided_at, reason, horizon, thesis, risks, review_conditions, notes, timestamps, revision |
| risk_settings | portfolio_id PK, owner_id, max_position_pct, top3_pct, top5_pct, quote_max_age_hours, fx_max_age_hours |
| valuation_snapshots | id, owner_id, portfolio_id, as_of, value_base, net_contributions_base, complete, inputs_hash, engine_version; unique(portfolio_id,as_of,inputs_hash); cache, nie źródło prawdy |
| import_batches | id, owner_id, portfolio_id, file_sha256, adapter_id/version, mapping_json, state PREVIEW/COMMITTED/FAILED, expires_at, counts |
| import_rows | batch_id, row_number, normalized_json, errors_json, source_id?, fingerprint?, occurrence; unique(batch_id,row_number) |
| import_receipts | portfolio_id, adapter_id, source_namespace (konto brokera), source_id_or_fingerprint, occurrence, operation_id; UNIQUE na pierwszych pięciu polach |
| documents | id, owner_id nullable tylko public, visibility PRIVATE/PUBLIC, instrument_id?, sha256, storage_key, mime, byte_size, pages, source_url?, source_policy_id?, status; private scope w indeksie hash |
| document_pages | document_id, page_number, text, extraction_version; unique(document_id,page_number); page_number = fizyczna strona PDF 1-based |
| report_analyses | id, document_id, cache_scope, document_hash, model, prompt_version, extractor_version, status, facts_json, interpretations_json, input_tokens, output_tokens, cost_usd?, cost_status, pricing_version, timestamps; unique(cache_scope,document_hash,model,prompt_version,extractor_version) |
| analysis_jobs | id, requested_by, document_id, analysis_id?, status, attempts, lease_until, reserved_cost_usd, dedupe_key, timestamps; unique dedupe_key; FOR UPDATE SKIP LOCKED |
| ai_budget_periods | user_id, period_start, limit_usd, reserved_usd, spent_usd; PK(user_id,period_start); atomowe reserve/settle/release |
| report_access | user_id, document_id, analysis_id?; unikalny dostęp; brak dostępu przez zgadnięty hash |
| interest_signups | id, email_normalized unique, consent_version, consent_at, source, confirmed_at?, deleted_at?; bez danych portfela |

Własność: composite FK (portfolio_id,owner_id) → portfolios(id,owner_id), analogicznie instrumenty, notatki, notowania, importy. Dodanie unique(id,owner_id) w tabelach nadrzędnych zapobiega cross-tenant FK. Publiczne instrumenty/raporty wymagają osobnej ścieżki dostępu, nigdy owner_id z klienta. Złożone CHECK/FK dopisane w migracji, nie tylko w Zod.

## Ledger
BUY zmniejsza gotówkę o quantity×price+fee. SELL zwiększa o quantity×price−fee i proporcjonalnie zmniejsza koszt pozycji. DEPOSIT/WITHDRAWAL zmienia środki i wpłaty netto. Kompensujące zdarzenie korekty + revision zamiast cichego nadpisania po imporcie. Początkowy stan = wpłaty + transakcje, bez ukrytego salda początkowego.
Waluta prowizji w MVP musi odpowiadać walucie transakcji; inna waluta → jawny błąd wymagający normalizacji w importerze. Każde subkonto walutowe zasila się oddzielnie. Wymiana walut i transfery są przyszłymi typami zdarzeń, nie formularzem MVP. Import wymagający odtworzenia nieobsługiwanej wymiany walut jest blokowany z jawnym powodem; po otrzymaniu próbki trzeba ocenić, czy wymagane księgowanie mieści się w istniejących typach operacji. Nie traktować wymiany wewnętrznej jako nowej zewnętrznej wpłaty.
Przyszłe typy dywidend/splitów/transferów wymagają jawnego wersjonowania event union i migracji. Nie wrzucamy nieobsługiwanych zdarzeń do BUY.


---

# Semantyka obliczeń i przypadki kontrolne
Silnik przyjmuje uporządkowane operacje, notowania i kursy z timestampami; zwraca decimal strings, kompletność i diagnostykę. Brak zależności od zegara — asOf jako argument. Brak dzielenia przez zero: wynik procentowy null + reason, nie 0/Infinity.

## Koszt i wynik
BUY: koszt lokalny += q×p+fee; koszt bazowy += (q×p+fee)×historyczny kurs transakcji. Średnia = pozostały koszt / pozostała ilość. SELL q: koszt rozchodowany = koszt pozostały × q / ilość przed SELL; realized = (q×cena−fee)×FX sprzedaży − rozchodowany koszt bazowy. Całkowite wyjście zeruje ilość i koszt (bez pyłu). Sprzedaż większa niż posiadana ilość jest błędem.
Wartość pozycji = ilość×ostatnia cena×kurs wyceny. Unrealized = wartość−pozostały koszt bazowy. P/L nominalny portfela = całkowita wartość (pozycje + gotówka) − wpłaty netto w PLN (historyczny FX wpłat/wypłat). Obejmuje wpływ FX i koszty; nie jest samą sumą realized/unrealized akcji, gdy występuje gotówka walutowa. Pokaż rozbicie i opis „obejmuje zmianę kursów”.
„Zainwestowany kapitał” w UI zastępujemy jednoznacznymi „wpłaty netto” i „koszt otwartych pozycji”. Procent na pozycji = unrealized/koszt pozostały. Procent portfela = P/L/wpłaty netto tylko gdy >0, etykieta „prosta stopa od wpłat netto, bez uwzględnienia czasu”. Nie reklamujemy jej jako TWR/XIRR; te miary później z testami przepływów. Niepełny zestaw cen/FX → wartość kompletna null i osobno subtotal wycenionych aktywów; brak ukrytego pomijania pozycji.

## Waluty i świeżość
FX zawsze liczba PLN za 1 jednostkę obcej waluty; PLN=1. Kurs transakcji zapisany historycznie i niezmienny przy aktualizacji kursu bieżącego. Brak FX → blokada zapisu wymagającego przeliczenia. Żadnej automatycznej konwersji FX po kursie 1. quote.as_of ≤ asOf, kurs.as_of ≤ asOf; przyszłe odrzucone. UI pokazuje zakres dat wykorzystanych danych i daty per pozycja; age > próg (domyślnie 72h, konfigurowalne) = stale. To prosta reguła, nie kalendarz sesji giełdowych.

## Symulator
Kwota to budżet całkowity z prowizją. q=floor((budżet−fee)/cena, quantity_scale); rzeczywisty koszt=q×cena+fee; reszta pozostaje gotówką. Dla nowych środków zasilamy gotówkę kwotą budżetu, a potem BUY. Dla istniejącej gotówki budżet musi mieścić się w subkoncie danej waluty; brak automatycznej wymiany. Licznik udziału: nowe q × referencyjna cena wyceny × bieżący FX. Mianownik: cały portfel po zmianach, z uwzględnieniem prowizji i pozostałej gotówki. Cena zakupu może różnić się od wyceny: oba pola/założenia jawne; nowy instrument bez ceny referencyjnej używa ceny scenariusza i oznacza założenie. Średnia zakupu obejmuje prowizje. Symulator nie zapisuje ledgeru.

## Ryzyko
Udziały względem całkowitej wartości z gotówką; top3/5 liczone dla instrumentów (cash widoczny osobno). Kraj emitenta ETF ≠ ekspozycja geograficzna aktywów; etykieta kraj emitenta/funduszu, brak look-through. Waluta notowania ≠ pełne ryzyko walutowe. Nieznane kategorie pozostają widoczne, bez wnioskowania z tickera.
Szok jednej pozycji: wartość' = wartość − wartość pozycji×spadek; FX stały. Szok rynku: wszystkie papiery × (1−spadek), gotówka bez zmian. Progi domyślne 25% pozycja / 60% top3 / 80% top5 są ustawieniami produktu do pilotażu, nie uniwersalną oceną bezpieczeństwa.

## Obowiązkowe golden cases w etapie 3
1. BUY 2×100 +2 i BUY 1×130 +1 → q=3, koszt=333, średnia=111.
2. SELL 1×150 −1 → realized=38, q=2, koszt=222; wycena 140 → unrealized=58 (PLN).
3. BUY 0.125×80 +0.5 USD przy FX4 → koszt 42 PLN; cena90 i FX4.2 → wartość47.25, unrealized5.25.
4. Budżet1000, cena300, fee5, scale0 → 3 sztuki, koszt905, reszta95. Na gotówce portfela1000 → wartość995; nowe środki do portfela1000 →1995 przy wycenie300.
5. Aktywa600/300/100 +cash100 → top3 90.909…%, pozycja600 54.545…%; szok50% całości papierów →600.
6. SELL przy zerowej ilości, niedostateczna gotówka, ujemna opłata, brak FX i future quote → błąd; dwie identyczne legalne transakcje nie są automatycznie duplikatem.
7. Wycofanie całości wkładów → mianownik ≤0 → procent null; niepełna wycena → brak pełnego P/L.


---

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


---

# Import i raporty — plan integracji

## XTB: blokada mapowania
Nie dostarczono eksportu. Nie twierdzimy, że wspieramy format XTB. UI umożliwi wybór pliku i mapowanie, ale adapter xtb-verified pozostaje disabled z kodem SAMPLE_REQUIRED. Potrzebna zanonimizowana próbka z nagłówkami, datami, strefą, BUY/SELL, prowizją, różnymi walutami i ułamkami; zachować powtarzalne ID operacji. Sprawdzić, czy faktyczny eksport jest CSV czy XLSX — nie zmieniać rozszerzenia i nie zgadywać.
Kontrakt parsera: detect(bytes,metadata) → supported/unsupported/needsMapping; preview → normalized rows + issues + provenance; commit wyłącznie zatwierdzonego snapshotu. Limity wierszy/kolumn/pola, separator/encoding/daty jawne; parser CSV zgodny z quoting i newline w komórce. Nie wykonywać formuł; przy eksporcie neutralizować =,+,-,@. Plik traktowany jako dane.
Deduplikacja: preferowane ID brokera + namespace konta + typ. Fallback hash kanonicznych pól ekonomicznych + multiplicity/occurrence; dwie identyczne legalne transakcje muszą się zachować. Nakładające się eksporty bez stabilnego ID oznaczają niepewność i wymagają decyzji w podglądzie. SHA całego pliku wykrywa tylko identyczny plik, nie zastępuje deduplikacji wierszy. Unique receipt + transakcja przy commit i test równoczesnych importów. Eksport obejmujący niespójny ledger nie jest częściowo zapisywany bez jawnej decyzji użytkownika.

## PDF / URL
API zapisuje metadane i job, nie analizuje synchronicznie. Pliki poza publicznym katalogiem; losowe storage_key, magic bytes i faktyczne parsowanie PDF (nie tylko MIME/nazwa), streaming limit, limit100stron, timeout30s ekstrakcji, limit tekstu300k znaków. Parser w odizolowanym procesie z limitami CPU/pamięci, bez wykonywania JavaScript/załączników PDF. Skan bez tekstu → OCR_REQUIRED, OCR poza MVP. Dokument zaszyfrowany/uszkodzony → jawny błąd. AV scan przed zewnętrznym pilotem i dostawcą AI.
URL: tylko HTTPS443, allowlista źródeł w pilotażu, zakaz credentials, private/loopback/link-local/metadata IPv4 i IPv6; resolve i pin IP, ponowna walidacja każdego redirectu max3, limity stream/time, ochrona DNS rebinding i egress firewall. Jeśli bezpiecznego fetchera brak, endpoint disabled — nie prosty fetch dowolnego URL. Dostęp do pliku po autoryzacji/krótki signed URL.

## AI
Provider interface analyze(pages,profile,budget,signal). Konfigurowalny model z allowlisty serwera; OpenAI jako pierwszy adapter, bez kluczy po stronie klienta. Structured output + Zod. Fakty: {claim,value?,unit?,period?,citations:[{page,quote}]}; interpretacje: {text,basedOnFactIds,uncertainties}. Każdy cytat weryfikowany jako fragment znormalizowanego tekstu danej strony; brak zgodności usuwa twierdzenie i ustawia PARTIAL. Cytat nie dowodzi poprawności interpretacji — testować próbki ręcznie. Raport to niezaufane dane; instrukcje w PDF nie sterują narzędziami/promptem. Brak narzędzi web/action w wywołaniu analizy. Bez poleceń kup/sprzedaj, oddzielna sekcja ograniczeń.
Wejście maks.40k tokenów, wyjście4k, timeout90s, 1 aktywny job/użytkownik; limity konfigurowalne po pomiarach. Domyślny pilotaż: budżet0.50USD/użytkownik/miesiąc, hard cap0.15USD/analiza, kill switch systemowy i limit dzienny. To ustawienia aplikacji, nie ceny dostawcy. Przed wywołaniem oszacować górną cenę wg wersjonowanego cennika modelu (bez znanej ceny reject), atomowo zarezerwować budżet. Po wywołaniu usage×cennik, settle/release. Jeśli timeout po wysłaniu i brak usage: koszt UNKNOWN, zachować rezerwację do reconciliacji; bez automatycznego retry nieznanego naliczenia. Zapisywać osobno input/cached/output, walutę USD, pricing_version i koszt ekstrakcji jeśli płatna. Błędy/odmowa nie są raportem. Żadnego udawanego „0 USD”, gdy brak usage.
Cache: klucz (scope,sha256,extractorVersion,model,promptVersion). PRIVATE scope=userId; nie współdzielić przez hash. PUBLIC scope tylko po weryfikacji publiczności i warunków źródła, bez prywatnych tez/notatek w promptach; ogólna analiza może być wspólna. Cache lookup po kontroli dostępu; job dedupe/unique zapobiega podwójnemu naliczeniu. Personalizację później przechowywać oddzielnie.

## V2
Interfejs source connector: discover(since), fetch(document), policy(). Rejestr polityk: źródło, licencja/ToS URL, data weryfikacji, limity, identyfikacja klienta, zakres dozwolonego cache/redistribution. SEC EDGAR, ESPI/EBI i IR nie są jeszcze zweryfikowane; konektory domyślnie wyłączone. Etap V2 zaczyna się od sprawdzenia oficjalnych warunków, następnie scheduler, dedup, alerty. Nie implementujemy scrapingu ani nie deklarujemy praw do redystrybucji.


---

# Walidacja biznesowa

## Potwierdzone źródłami a hipotezy
Przegląd źródeł 15.11.2026 (bez pełnego hands-on):
| Alternatywa | Potwierdzone funkcje | Hipoteza wyróżnienia InvestorKit |
|---|---|---|
| myfund.pl | Importy brokerskie i XTB, zarządzanie portfelami; oficjalna pomoc i forum | Prostota pierwszych10min, czytelne założenia symulatora; wymaga testu porównawczego |
| Portfolio Performance | Open source desktop, historia operacji, TWR/IRR, alokacja, import, konta walutowe | Polski onboarding web bez instalacji; przewaga obliczeniowa konkurenta |
| getquin | Darmowy dostęp i płatne subskrypcje z dodatkowymi funkcjami według regulaminu | Konkretny workflow polskiego początkującego; nie zakładamy luki bez wywiadów |
| Arkusz / ekran brokera | Alternatywa do sprawdzenia w rozmowach, nie zweryfikowana analiza produktu | Mniej ręcznego utrzymywania i wyraźny wpływ zakupów na koncentrację |
Źródła pierwotne:
- https://www.myfund.pl/index.php?helpID=30&raport=pomoc
- https://myfund.pl/index.php?forum=6&raport=forum&topic=6743
- https://help.portfolio-performance.info/en/about/
- https://www.portfolio-performance.info/en/
- https://www.getquin.com/general-terms-and-conditions/
Nie podajemy niezweryfikowanych cen konkurentów. Sam zestaw dashboard+AI nie stanowi przewagi; największe ryzyko to brak powodu do regularnego powrotu.

## Problemy do sprawdzenia (ranking hipotez)
1. Nie wiem, ile zarobiłem po FX/prowizjach i częściowej sprzedaży.
2. Nie rozumiem, jak dokupienie zmienia koncentrację i gotówkę.
3. Gubię powody decyzji i nie wracam do tez.
4. Raporty są długie, nie umiem odróżnić istotnych liczb od narracji.
5. Ręczne przepisywanie danych jest za pracochłonne.

## Wywiad: 20 min, 10–15 osób XTB
Zapytaj o ostatni konkretny zakup, sposób sprawdzenia wyniku, ostatni błąd, używany arkusz/aplikację, czas utrzymania i faktycznie płacone narzędzia. Poproś o pokazanie procesu na zanonimizowanych danych. Dopiero później zadanie: dodaj portfel i sprawdź nowy zakup. Obserwuj bez prowadzenia. Pytania końcowe: co zastąpiłoby narzędzie, czego brakuje do używania co miesiąc, kto podejmuje decyzję o płatności? „Czy zapłacisz?” ma małą wartość bez zachowania.

## Landing i zbieranie zainteresowania — etap6
Treść hero: „Zrozum swój portfel przed kolejnym zakupem”. Podtytuł: „Sprawdź wynik po kosztach i walutach, przetestuj zakup i zapisz powód decyzji. Po polsku, z jawnymi założeniami”. CTA „Dołącz do pilotażu”. Sekcje: wynik / symulator / dziennik, wyraźnie prototyp i ręczne dane, nie obiecywać działającego importu XTB ani live quotes. Formularz email + krótka informacja prywatności + wersjonowana zgoda na kontakt o pilotażu, bez domyślnie zaznaczonego checkboxu i bez wymuszonej zgody marketingowej. Neutralne potwierdzenie; double opt-in z dostawcą maila w zadaniu B04. Brak fałszywych opinii/liczników klientów.

## Test ceny i decyzje
Po działającym workflow: pokaż konkretny plan19 lub29zł/miesiąc i zaproszenie do płatnego pilota po uruchomieniu płatności; teraz zapis deklaracji i zgody na kontakt, bez obciążania karty. Mierz powrót i wykonanie zadania; lista mailingowa mierzy wyłącznie zainteresowanie. Robocza bramka: ≥5 z10 badanych samodzielnie aktywowanych, ≥3 wraca w tygodniu4, ≥3 deklaruje konkretny płatny pilot i odpowiada na zaproszenie. Mała próbka kierunkowa, nie estymacja rynku; progi ustalone przed testem.
Aktywacja: rejestracja→portfel→wpłata+BUY→pełna wycena→pierwsza symulacja w7dni. Time-to-value: mediana czasu do pełnej wyceny; target<10min testu. Retencja: aktywowana kohorta z wyceną/symulacją/notatką w tygodniu1 i4, nie sam login. Koszt AI na aktywnego, odsetek niekompletnych wycen, błędy importu i zgłoszenia błędów wyniku. Eventy bez kwot, tickerów i treści portfela. 30dni testu; jeśli brak powrotów, zawęzić produkt przed AI.


---

# Backlog i plan małych zadań
Statusy: TODO / DONE / BLOCKED / PARTIAL. Estymaty to godziny pracy implementacyjnej bez nauki i oczekiwania na feedback. Nie są zobowiązaniem terminu. Definicja DONE: kryteria spełnione, odpowiednie testy uruchomione, README zaktualizowane, brak sekretów. Kolejność wierszy jest kolejnością wdrażania; zależności wskazane jawnie.

| ID | Zadanie | h | Zależność | Status / akceptacja |
|---|---|---:|---|---|
| S01 | Specyfikacja i kryteria US | 2 | — | DONE: docs01 |
| S02 | Architektura, model, API i matematyka | 4 | S01 | DONE: docs02–06 |
| S03 | Walidacja biznesowa i rejestr ryzyk | 2 | S01 | DONE: docs07/09 |
| F01 | npm workspaces, strict TS, Node24 | 1 | S02 | DONE: strict typecheck przechodzi |
| F02 | Dokładne wersje i lockfile | 1 | F01 | DONE: exact versions + package-lock.json |
| F03 | Compose PostgreSQL i env validation | 1 | F01 | PARTIAL: env validation i Compose; Docker nieweryfikowany |
| F04 | Auth schema i migracja | 2 | F02,F03 | DONE: migrate na prawdziwym PostgreSQL17 |
| F05 | Better Auth + cookies + handler | 2 | F04 | DONE: signup/login/logout integration |
| F06 | Owner scoped portfolio repo | 2 | F05 | DONE: owner isolation i concurrent limit integration |
| F07 | Rate limit, origin guard, errors, log redaction | 2 | F05 | DONE: origin/errors/size/HTTP429 integration |
| F08 | React/Tailwind/shadcn, Router, Query | 2 | F02 | PARTIAL: build i theme; wizualna inspekcja zablokowana |
| F09 | Rejestracja/logowanie i portfel UI | 2 | F06,F08 | PARTIAL: UI/API wdrożone, E2E zablokowany przed startem |
| F10 | Vitest unit + PostgreSQL integration | 2 | F06,F07 | DONE: 4 unit i8 integration PASS |
| F11 | Playwright i CI | 2 | F09,F10 | PARTIAL: CI/E2E przygotowane, socket Chromium blokuje lokalny test |
| F12 | OpenAPI i contract tests | 2 | F07 | TODO: dokument generowany z DTO |
| P01 | Decimal i operacje domain | 2 | F01 | TODO: brak number w obliczeniach |
| P02 | BUY/SELL koszt i prowizja | 3 | P01 | TODO: golden cases1/2 |
| P03 | Gotówka, wpłaty, wypłaty, FX | 3 | P02 | TODO: golden case3 + salda |
| P04 | Wycena, kompletność, P/L | 3 | P03 | TODO: stale/missing/future |
| P05 | Symulator oba źródła środków | 3 | P04 | TODO: case4, brak skutków ubocznych |
| P06 | Koncentracja i stress | 2 | P04 | TODO: case5, unknown buckets |
| P07 | Testy regresji i granic | 3 | P02–06 | TODO: case6/7, ułamki i zero |
| A01 | Migracje instrument/ledger/FK/check | 2 | P01,F04 | TODO: cross-tenant FK reject |
| A02 | Instrument i ręczne quote/FX API | 2 | A01 | TODO: owner scope |
| A03 | Operacje API i blokada salda | 3 | P03,A01 | TODO: concurrent BUY nie wydaje dwa razy |
| A04 | Formularze operacji i historia | 3 | A03,F09 | TODO: walidacja/empty/error |
| A05 | Dashboard i pozycje | 3 | P04,A04 | TODO: brak sztucznych danych |
| A06 | Symulator UI/API | 3 | P05,A05 | TODO: assumptions + before/after |
| A07 | Ryzyko UI i ustawienia | 2 | P06,A05 | TODO: progi i scenariusze |
| A08 | Dziennik CRUD | 3 | A02,F09 | TODO: prywatność, revision |
| A09 | Snapshot history | 2 | A05 | TODO: luki danych jawne |
| I01 | Kontrakt parsera i blokada XTB | 1 | S02 | PARTIAL: availability contract i SAMPLE_REQUIRED; parser DTO przed I03 |
| I02 | Zanonimizowana próbka XTB | — | użytkownik | BLOCKED: brak pliku |
| I03 | CSV preview/mapowanie | 3 | I01 | TODO: quoting, encoding, limit |
| I04 | Zweryfikowany adapter XTB | 3 | I02,I03 | BLOCKED: format, waluty, fees |
| I05 | Receipt dedup i atomowy commit | 3 | I04,A03 | TODO: powtórny/równoległy import |
| R01 | Prywatny upload i ekstrakcja PDF | 4 | F07 | TODO: limits/timeout/magic bytes |
| R02 | Bezpieczny URL fetcher | 4 | R01 | TODO: SSRF/redirect/DNS tests |
| R03 | Jobs PostgreSQL i ACL/cache scope | 3 | R01 | TODO: dedupe, leases, private/public |
| R04 | Budżet i provider OpenAI | 3 | R03 | TODO: reserve/settle, UNKNOWN usage |
| R05 | Weryfikacja cytatów/output Zod | 3 | R04 | TODO: fabricated citation reject |
| R06 | Historia i UI raportów | 3 | R05 | TODO: fact vs interpretation |
| B01 | 10–15 wywiadów | — | S03 | TODO: dowody problemu |
| B02 | Landing z formularzem | 3 | F08 | TODO: jasny status produktu |
| B03 | Pilot i pomiar kohort | — | A05–08 | TODO: metryki z docs07 |
| B04 | Mail verify/reset/double opt-in | 3 | F05,B02 | TODO: single-use/expired tokens |
| B05 | Export/delete i retencja | 3 | A08,R06 | TODO: usuwanie blobów, DB i jobów |
| B06 | Backup + restore drill + audyt dostępności | 3 | B05 | TODO: przed publicznym pilotem |
| B07 | Decyzja o płatnym pilotażu | 1 | B03 | TODO: dopiero wtedy backlog billing |

Najbliższy punkt kontynuacji: domknąć F03/F08–F09/F11 w lokalnym środowisku, F12, potem P01. Etap3 nie zaczyna się od dashboardu z fikcyjnymi danymi. V2 źródła automatyczne i płatności celowo bez zadań implementacyjnych.


---

# Ryzyka i pytania otwarte
| ID | Ryzyko / status | Działanie i bramka |
|---|---|---|
| K01 | Niewielka gotowość do płacenia mimo szerokiego briefu | MVP-A i rozmowy przed AI; retencja i zaproszenie do konkretnego planu |
| K02 | Wynik mylony z podatkowym lub czasowym | Jawna semantyka docs04, brak deklaracji FIFO/PIT/TWR |
| K03 | Niepełny ledger i błędne FX | Walidacja wszystkich stanów, niekompletność wyniku widoczna |
| K04 | XTB format nieznany | Adapter disabled do próbki, nie zgadywać CSV/XLSX |
| K05 | Raport ujawniony innemu użytkownikowi | Private cache per owner, ACL przed lookup, test hash collision scope |
| K06 | Halucynacje/prompt injection | Zod, cytaty stron, tekst raportu jako dane, brak narzędzi wykonawczych |
| K07 | Niekontrolowane koszty AI | Atomowy reserve, kill switch, bez retry nieznanego usage |
| K08 | SSRF i złośliwy PDF | Fetch allowlist/egress i isolated parser; feature off bez ochrony |
| K09 | Brak praw do feedów/raportów | Manual MVP; source policy review przed V2/public cache |
| K10 | Zakres za duży dla pojedynczego developera | Małe PR-y i MVP-A przed B; szacunki zweryfikować po foundation |
| K11 | Niepełny proces auth produkcyjnego | Email/reset, rotacja sekretów, limity i testy przed publicznym pilotem |
| K12 | Brak repo zdalnego i Dockera w Work | Archiwum źródeł; CI przygotowane, DB/E2E nieoznaczane jako wykonane |

Otwarte decyzje: próbka XTB, dostawca maila, hosting/bloby i region, model AI i jego aktualny cennik przed R04, reguła weryfikacji źródeł publicznych. Nie blokują lokalnego foundation. Zmiana bazowej waluty na wiele walut interfejsu poza pierwszym pilotem; instrumenty pozostają PLN/EUR/USD. Przed wdrożeniem zweryfikować politykę prywatności i warunki produktu; ten dokument nie stanowi analizy prawnej.
