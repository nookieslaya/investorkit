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
