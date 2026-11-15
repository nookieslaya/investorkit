# InvestorKit — instrukcje dla Codexa

## Zanim zmienisz kod
- Przeczytaj README.md, docs/HANDOFF.md i docs/08-backlog.md.
- Semantyka finansowa: docs/04-calculations.md. Kontrakty: docs/05-api.md. Pełny zakres: docs/INVESTORKIT-MVP.md.
- Realizuj małe zadanie z backlogu. Nie generuj całego systemu w jednej zmianie.
- Oddziel specyfikację docelową od istniejącego kodu. Nie opisuj szkicu ani kontraktu jako działającej integracji.
- portfolio-engine zawiera P01–P03: decimal, BUY/SELL, gotówka i historyczny koszt PLN/FX. API/UI obsługują wyłącznie wpłaty/wypłaty; instrumenty, transakcje BUY/SELL w API i wyceny pozostają niewdrożone. report-engine jest szkieletem.

## Granice architektury
- apps/web: widoki, routing, query cache, formatowanie; bez dostępu do DB i sekretów.
- apps/api: autoryzacja, use cases, transakcje, adaptery.
- packages/db: Drizzle, migracje, połączenie.
- packages/shared: Zod DTO i typy publiczne; bez importów DB lub aplikacji.
- portfolio-engine: czyste, deterministyczne obliczenia; bez React/Fastify/DB i odczytu aktualnego zegara.
- report-engine: kontrakty i logika analiz; integracja modelu wyłącznie po stronie serwera.
- Bez mikroserwisów, Redis, dodatkowych ORM lub frameworków bez konkretnego wymagania.

## Kod i finanse
- TypeScript strict; bez any i wyłączania reguł dla obejścia problemu.
- Zod na granicach; nie ufaj typom TypeScript dla JSON z zewnątrz.
- Pieniądze, kursy i ilości jako decimal strings w DTO i PostgreSQL numeric. Obliczenia decimal.js; nigdy nie sumuj ich jako number.
- Jawne jednostki, kierunek FX, skala, metoda zaokrągleń, asOf i źródło danych.
- Missing/stale/future prices nie mogą udawać aktualnych wycen.
- Średni koszt analityczny nie jest rozliczeniem podatkowym. Prosta stopa zwrotu nie jest TWR/XIRR.
- Brak shortów, CFD i margin. Sprawdzaj wszystkie stany ledgeru po operacjach wstecznych.
- Waluta prowizji w MVP = waluta transakcji. Inny przypadek wymaga jawnego błędu, nie kursu1.

## Bezpieczeństwo
- ownerId zawsze z sesji. Każdy odczyt i mutacja wymagają owner scope. Cudzy zasób zwraca404.
- Przy ledgerze używaj transakcji, blokady portfela i idempotencji. Composite FK mają chronić granice tenantów.
- Bez haseł brokerów, kluczy VITE_* z sekretami, logowania tokenów/cookies/body/raportów.
- URL raportu jest niezaufany. Nie dodawaj fetch dowolnego URL bez ochrony SSRF/redirect/DNS.
- Private cache raportu per user. Wspólny cache tylko dla zweryfikowanych dokumentów publicznych.
- Analiza AI wymaga atomowej rezerwacji budżetu, limitu wyjścia i weryfikacji cytatów. UNKNOWN usage nie oznacza kosztu0.

## Testy i utrzymanie
- npm run build:packages przed testami importującymi workspace exports.
- npm run typecheck, npm test i npm run build dla adekwatnej zmiany.
- npm run test:integration wymaga TEST_DATABASE_URL: dedykowana, migrowana baza jednorazowa. Nigdy baza produkcyjna.
- npm run test:e2e wymaga Chromium i TEST_DATABASE_URL. Nie używa istniejących serwerów; lokalnie E2E_WEB_PORT=5174 E2E_API_PORT=3002, by nie zatrzymywać aplikacji użytkownika. Test tworzy konta w dedykowanej bazie.
- Matematyka: golden cases i granice z dokumentacji, w tym SELL częściowy, fees, FX, ułamki, zero i brak wyceny.
- Import: powtórny i równoległy import, nakładające się eksporty, identyczne legalne transakcje.
- Nie usuwaj testu, by ukryć błąd; nie deklaruj testów jako wykonanych, jeśli środowisko je blokuje.
- Migracje generuj i przeglądaj. Bez schema push w produkcji.
- Po etapie aktualizuj README, backlog, HANDOFF i VERIFICATION; zapisuj ograniczenia.

## Ograniczenia zakresu
- Bez płatności i pełnego automatycznego pobierania raportów na pierwszym etapie.
- Adapter XTB zablokowany do zweryfikowania próbki eksportu. Nie zgaduj nagłówków/formatu.
- Nie dodawaj rekomendacji kup/sprzedaj, prognoz, live feeds, PIT ani look-through ETF do MVP.
- UI po polsku, etykiety gotowe do późniejszego i18n; dostępna klawiatura, widoczny focus, błędy i empty states.
- Brak nowych zależności bez uzasadnienia; przed aktualizacją sprawdź aktualną dokumentację, stabilne wersje i zgodność Node24.
