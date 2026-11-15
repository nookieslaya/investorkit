# Stan projektu i następna sesja

15.11.2026: P01–P03 DONE. Publiczne repozytorium https://github.com/nookieslaya/investorkit, origin/main. Działa lokalny frontend localhost:5173, API127.0.0.1:3001 i Compose PostgreSQL17. Konto i portfel użytkownika zachowane. Użytkownik chce widzieć zmiany na froncie; P03 objęło pionowy fragment gotówki (części A01/A03/A04), zamiast wyłącznie silnika.

Zaimplementowane:
- P01 decimal40/HALF_EVEN; P02 lokalny koszt BUY/SELL; P03 `replayLedger` sortuje daty, zachowuje kolejność wejścia przy remisie i sprawdza każde saldo po operacjach wstecznych. Osobna gotówkaPLN/EUR/USD, historyczne wpłaty netto i koszt bazowy PLN, częściowa i całkowita sprzedaż oraz realizedBase. Jawne FX12: PLN=1, przyszły/brakujący FX odrzucony, bez automatycznej konwersji.
- W API/UI tylko DEPOSIT/WITHDRAWAL. Tabela cash_operations: composite tenant FK, CHECK, UUID idempotencji i hash normalizowanego body; blokada portfela w transakcji, replay całej osi czasu przed zapisem. Limit1000 operacji na portfel. Snapshot pieniężny zaokrąglany HALF_EVEN do10 miejsc z kontrolą overflow; ledger przechowuje oryginalne amount/FX.
- Panel: salda3 walut, historyczne wpłaty netto PLN, wpłata/wypłata, historyczny kurs i data EUR/USD, notatka, historia i stan błędów. Formularz przechowuje klucz ponowienia przy błędzie sieci. Nie ma wartości rynkowej/P&L ani zapisu BUY/SELL.
- OpenAPI obejmuje8 operacji własnych; kontrola aktualności CI. Auth delegowany do Better Auth.

Następny krok: P04 (wycena, kompletność, P/L); P05–P07 potem. Aby prezentować kolejne wyniki na froncie, potrzebny będzie ograniczony zakres instrumentów i ręcznych cen z A01/A02; nie używać fikcyjnych cen. A01/A03/A04 są PARTIAL dla gotówki; przed BUY/SELL w API trzeba połączyć cash_operations z pełnym ledgerem i zabezpieczyć wspólną oś czasu/blokadę/idempotencję. Nie prowadzić niezależnych sald gotówki dla dwóch ledgerów.

Migracja0001_past_gauntlet.sql (CREATE cash_operations bez usuwania danych) przejrzana, zastosowana na dedykowanej bazie testowej i bazie lokalnej aplikacji. Przed zmianą wykonano lokalny pg_dump w ignorowanym `.local-backups/` (prywatne dane; nie publikować). Nie dodano fikcyjnych transakcji do portfela użytkownika.

Testy: TEST_DATABASE_URL wskazuje wyłącznie migrowaną investorkit_contract_test. E2E wymaga tej zmiennej i uruchamia własne serwery; lokalnie E2E_WEB_PORT5174 / E2E_API_PORT3002, bez reuse. E2E tworzy konta i operacje tylko w bazie testowej. Aktualne wyniki i ograniczenia w VERIFICATION.md. Zrzuty cash-desktop.png i cash-mobile-dark.png w test-results zostały obejrzane; bez obcięć i poziomego overflow.

Nie wdrożono: instrumentów/quote API, BUY/SELL API/UI, wyceny, symulatora, importu XTB (brak próbki), raportów AI. Brak płatności i automatycznego pobierania raportów. Średni koszt jest analityczny, nie podatkowy. Sekrety/buildy/test-results/backupy są ignorowane w Git.

P03 CI PASS (61 unit, 17 integration, 1 E2E): https://github.com/nookieslaya/investorkit/actions/runs/43753978922. Interfejs lokalny działa po migracji; kolejny etap P04.
