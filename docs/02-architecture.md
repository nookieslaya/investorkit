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
