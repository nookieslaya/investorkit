# Syntetyczny przykład XLSX w udokumentowanym układzie XTB

`account-demo-pln.xlsx` zawiera wyłącznie wymyślone operacje, identyfikatory,
daty i ceny. Powstał na żądanie właściciela projektu. Nazwy XTB, PKO i PZU
oznaczają instrumenty; kwoty nie są pobrane z rynku ani z konta użytkownika.
To materiał do rozwoju importera, **nie oryginalny eksport brokera**.

## Pochodzenie struktury

Sprawdzono 20.11.2026:

- [Oficjalna pomoc XTB: historia pozycji i operacji](https://www.xtb.com/pl/centrum-pomocy/platformy-tradingowe/historia-pozycji-oraz-operacji-gotowkowych-web-i-aplikacja-mobilna)
  potwierdza eksport raportu do Excela. Nie publikuje kompletnego schematu
  kolumn ani pliku wzorcowego do pobrania.
- [Publiczna fixture xStation w LuxAlgo/trade-journal](https://github.com/LuxAlgo/trade-journal/blob/834e7b68f553d1aba0d7777875cdc4622f5a7eb5/packages/importers/tests/xtb-fixture.ts)
  opisuje układ odtworzony z rzeczywistych eksportów: kolejność arkuszy,
  cztery wiersze wstępu, nagłówki w wierszu5, nazwy i kolejność kolumn,
  numeryczne ID i daty jako numery seryjne Excela. W tym wariancie występują
  `Closed Positions`, `Cash Operations` i `Open Positions`. Stąd zaczerpnięto
  schemat; kod generatora i dane nie zostały skopiowane.
- [Testy tego wariantu](https://github.com/LuxAlgo/trade-journal/blob/834e7b68f553d1aba0d7777875cdc4622f5a7eb5/packages/importers/tests/xtb.test.ts)
  dokumentują typy `Deposit`, `Stock purchase`, `Stock sell` i komentarze
  zawierające ilość/cenę. [Opis importera](https://github.com/LuxAlgo/trade-journal/blob/834e7b68f553d1aba0d7777875cdc4622f5a7eb5/docs/importers.md)
  rozróżnia sprawdzenie struktury od weryfikacji pliku z konta.

Nie zakładamy zgodności wszystkich wersji/języków eksportu XTB. Starsze pliki
używają innych nazw arkuszy i nagłówków. Ten przykład nie zamyka weryfikacji
adaptera I04 ani nie zastępuje rzeczywistej próbki użytkownika w I02.

## Zakres danych i wartości kontrolne

Jedno fikcyjne konto PLN, daty UTC, cztery zakupy, dwie sprzedaże, wpłata
i wypłata. Dwa zakupy XTB po różnych cenach, ilość ułamkowa, częściowe
zamknięcie XTB i pełne zamknięcie PZU. Prowizje i swap są jawnie zerowe,
konwersja PLN = 1. Nie wymyślamy niepotwierdzonych typów opłat w raporcie.
Nie ma dywidend, podatków, CFD, zdarzeń korporacyjnych ani obcego FX;
te przypadki wymagają osobnych próbek. Waluta PLN jest założeniem tej fixture,
nie uniwersalną regułą rozpoznawania waluty importu z nazwy pliku/tickera.

| Kontrola | Oczekiwane |
|---|---:|
| Operacje gotówkowe | 8 |
| Otwarte partie / instrumenty | 3 / 2 |
| Zamknięte partie | 2 |
| Ilość XTB / PKO / PZU | 9,5 / 20 / 0 |
| Gotówka | 2 930,00 PLN |
| Wpłaty netto | 4 800,00 PLN |
| Wartość otwartych pozycji | 2 430,00 PLN |
| Cały portfel | 5 360,00 PLN |
| Wynik zamkniętych / otwartych partii | 130,00 / 430,00 PLN |

Wiersze zbiorcze w `Open Positions` nie są dodatkowymi pozycjami. Wiersz
`Profit/loss` nie jest transakcją. Ta sama pozycja XTB występuje w historii
zamkniętej części i jako pozostała otwarta partia; nie wolno dodawać pierwotnego
zakupu ponownie z każdego arkusza. Wynik zamkniętych partii jest wynikiem
przykładowych lotów brokera, a nie obietnicą zgodności z analitycznym kosztem
średnim InvestorKit ani z podatkowym FIFO.

## Weryfikacja

```sh
python3 tests/fixtures/xtb/verify.py
```

Verifier używa wyłącznie standardowej biblioteki Python. Sprawdza zapisany
ZIP/XML, nagłówki, kolejność arkuszy, typy liczb/dat, brak formuł/makr/linków
zewnętrznych, daty w zakresie, unikalność ID, znaki przepływów, ilości i ceny
z komentarzy, wszystkie kolejne salda oraz zgodność zamkniętych i otwartych
partii z gotówką. Obliczenia kontrolne używają Decimal. Nie jest parserem
niezaufanych plików użytkownika ani nowym kontraktem API. Bez dostępu do DB.

**Status aplikacji:** XLSX nadal nie jest obsługiwany przez obecny ogólny
podgląd CSV. Nie zmieniaj rozszerzenia na CSV. Zapis importu i adapter XTB
pozostają osobnymi zadaniami; plik nie został zapisany do portfela.
