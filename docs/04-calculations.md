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

## Zaimplementowana podstawa P01

`@investorkit/portfolio-engine` eksportuje `FinancialDecimal` i guardy: `parseAmount`, `parseQuantity`, `parseUnitPrice`, `parseCommission`, `sumDecimals`. To arytmetyka bez waluty/jednostki; kolejne operacje domenowe muszą jawnie przenosić walutę, kierunek FX i jednostki. P01 nie wykonuje BUY/SELL, przeliczeń FX, wycen ani zapisów ledgeru.

- Wejście `FinancialDecimal.parse(unknown)`: wyłącznie zwykły decimal string, opcjonalny minus, maksymalnie 18 cyfr całkowitych i10 ułamkowych; bez koercji, spacji, separatorów, exponent, NaN/Infinity. Wyniki P/L mogą być ujemne. Kwoty i prowizje wymagają nieujemności; ceny i ilości dodatniości. `parseQuantity` przyjmuje skalę instrumentu 0–10 i odrzuca nadmiarowe miejsca; końcowe zera nie zwiększają skali wartości.
- Prywatny `Decimal.clone` z ustawieniami domyślnymi, precision40 i HALF_EVEN, niezależny od globalnego `Decimal.set`. Wartości i operacje są niemutowalne; brak eksportu surowego Decimal i konwersji do number. Liczby JS służą tylko skali, konfiguracji i wynikowi porównania.
- `plus/minus/times/dividedBy` zachowują 40 cyfr znaczących po każdej operacji, bez dodatkowego ograniczania do skali zapisu. Nie obiecujemy arytmetyki o nieskończonej precyzji ani niezależności sumy od kolejności przy ograniczonej precyzji; `sumDecimals` zachowuje kolejność wejścia.
- `toString`/`toJSON`: zwykły decimal string bez exponent, zbędnych zer i ujemnego zera. Wyniki pośrednie mogą przekraczać zakres wejściowy i skalę zapisu; nie traktować ich automatycznie jako publicznego DTO.
- `toFixed(scale)` zaokrągla HALF_EVEN przy prezentacji (0–10 miejsc); `toStorageString()` jawnie zaokrągla HALF_EVEN do numeric(28,10), bez paddingu, i odrzuca przepełnienie także powstałe wskutek zaokrąglenia. Nie parsować formatowanej prezentacji z powrotem do obliczeń. FX numeric(28,12) i jego granice pozostają do P03; serializer kwot nie jest serializerem kursu.
- `floorToScale` to jawna matematyczna podłoga, również dla wartości ujemnych. Walidacja wejścia sama nie zaokrągla. `dividedBy(0)` zgłasza `DIVISION_BY_ZERO`; `percentOf(base)` dla base≤0 zwraca `{value:null,reason:NON_POSITIVE_BASE}`, a dla dodatniej bazy wartość w procentach.
- Błędy domenowe mają stabilne kody (`DecimalDomainError.code`), bez danych wejściowych w komunikatach. Bez zegara, DB i frameworków.

Źródło zachowania Decimal: https://mikemcl.github.io/decimal.js/ (clone, precision, ROUND_HALF_EVEN, toDecimalPlaces). Golden cases portfela1–7 pozostają do P02–P07; nie są zamknięte przez testy samej arytmetyki.
