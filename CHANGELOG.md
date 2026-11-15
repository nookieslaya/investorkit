# Historia prac

## 0.1.0 — 2026-11-15

### Dokumentacja i decyzje
- Specyfikacja MVP, user stories i kryteria akceptacji; etapowanie MVP-A/MVP-B.
- Modularny monolit i sześć pakietów/katalogów zgodnie z briefem; rejestr decyzji i ryzyk.
- Docelowy model danych oraz API z owner scope, idempotencją i decimal strings.
- Semantyka wyniku, FX, prowizji, częściowej sprzedaży, ułamków, symulatora i brakujących wycen.
- Plan importu XTB z blokadą do próbki, bezpiecznego PDF/URL, analizy AI, cache i budżetów.
- Przegląd konkurencji na podstawie źródeł pierwotnych i plan walidacji popytu; bez deklarowania potwierdzonej gotowości do zapłaty.
- Backlog małych zadań, raport weryfikacji i instrukcje kontynuacji.

### Foundation
- npm workspaces, Node24, strict TypeScript, dokładne wersje i lockfile.
- Compose PostgreSQL17; Drizzle schema i pierwsza migracja auth + portfolios.
- Better Auth i Fastify: konto/sesja/logowanie/wylogowanie, origin guard, rate limiting, bezpieczne błędy i zredagowane logi.
- Repozytorium portfeli ograniczające zapytania do właściciela; unique owner zabezpiecza równoczesne tworzenie dwóch portfeli.
- React/Vite/Tailwind, Router/Query, Button w konwencji shadcn; polskie formularze konta i portfela, motywy, puste stany i komunikaty błędów.
- Kontrakty Zod, zablokowany kontrakt dostępności adaptera XTB, szkielety engine.
- Vitest unit/integration, scenariusz Playwright i workflow GitHub Actions.
- Test429 wykrył błąd kolejności instalacji pluginu rate-limit; poprawiono inicjalizację i potwierdzono rzeczywiste ograniczanie żądań.

### Potwierdzone i ograniczenia
- Typecheck i build przechodzą; 4 unit +8 integration na rzeczywistym PostgreSQL17.
- E2E nie przeszedł do testowania UI: środowisko odmawia socketu Chromium. CI i Compose nie były uruchomione.
- Silnik finansowy, operacje i analizy nie są wdrożone. Nie wykonano płatności, integracji AI ani automatycznego pobierania raportów.
- Szczegóły: docs/VERIFICATION.md. Nie traktować tej wersji jako gotowego publicznego SaaS.

### Publikacja GitHub — 15.11.2026
- Odtworzono historię Git z bundle i opublikowano publiczne repozytorium https://github.com/nookieslaya/investorkit.
- Dodano ignorowanie `.DS_Store`; lokalny build/typecheck/4 unit PASS na Node 24.
- Pierwszy CI PASS: migracja PostgreSQL17, build/typecheck, 4 unit, 8 integration, 1 Chromium E2E. F11 zamknięte; lokalny Compose i wizualna inspekcja UI pozostają do wykonania.
