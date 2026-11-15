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

Źródło zachowania Decimal: https://mikemcl.github.io/decimal.js/ (clone, precision, ROUND_HALF_EVEN, toDecimalPlaces). Golden cases nie są zamknięte przez testy samej arytmetyki P01; zakres ukończonego P02 opisano poniżej.

## Zaimplementowane P02 — koszt pozycji w walucie instrumentu

`Position.empty({instrumentId,currency,quantityScale})` tworzy pustą pozycję. `applyTrade` przyjmuje BUY/SELL z ilością, ceną, prowizją i jej walutą; wejście unknown jest walidowane ścisłymi DTO Zod z shared i guardami domenowymi. Nie jest to endpoint ledgeru. Odtwarzanie odbywa się przez jawne przekazywanie kolejnych nowych stanów; wejścia i poprzednie stany nie są mutowane. Stan można utworzyć od zera, bez przywracania kosztów z zaokrąglonego snapshotu.

- BUY dodaje quantity i quantity×unitPrice+commission do pozostałego kosztu lokalnego; średnia to koszt/ilość.
- SELL zwalnia remainingCostLocal×soldQuantity/quantityBeforeSale, bez używania zaokrąglonej średniej. RealizedLocal=(quantity×unitPrice−commission)−releasedCostLocal dotyczy tylko tej sprzedaży. Pełne zamknięcie zwalnia cały pozostały koszt i jawnie zeruje koszt/ilość; średnia pustej pozycji=null. Ponowny BUY zaczyna nową bazę kosztu.
- Zwracany cashDeltaLocal to potencjalna zmiana gotówki: ujemny koszt BUY albo przychód SELL pomniejszony o prowizję. Prowizja większa od przychodu SELL może dać ujemny przepływ; pokrycie go saldem będzie sprawdzać P03.
- Waluty instrumentu/transakcji muszą być zgodne, waluta prowizji musi być walutą transakcji (również przy fee0). Błędny instrument, waluta, prowizja i oversell są odrzucane; brak shortów. Dwie identyczne legalne transakcje są dwiema transakcjami, bez deduplikacji w silniku.
- Metadane i snapshot są niemutowalne. Snapshot diagnostyczny to decimal strings bez zaokrąglenia do skali DB; wynik pośredni może przekroczyć publiczną precyzję wejścia. Przy późniejszym zapisie potrzebna jawna granica serializacji.

Golden cases1 i część kosztowa2 PASS: q3/koszt333/średnia111; SELL1 po150−1 → realized38/q2/koszt222. Referencyjne 2×140−222=58 sprawdzone arytmetycznie; aktualna wycena i kompletność danych pozostają w P04. Ułamkowy BUY USD0.125×80+0.5 daje koszt lokalny10.5USD, średnia84USD/szt.; koszt42PLN wymaga historycznego FX4 i należy do P03. Nie wolno przeliczać pozostałego kosztu lokalnego na bazowy według bieżącego FX.

P02 nie prowadzi sald ani wpłat netto, nie pobiera kursów/cen, nie sortuje ledgeru, nie waliduje operacji wstecznych i nie oblicza podatków. Brak zegara/IO. Stabilne błędy `PositionDomainError.code`: INSTRUMENT_MISMATCH, CURRENCY_MISMATCH, COMMISSION_CURRENCY_MISMATCH, INSUFFICIENT_QUANTITY; pozostałe granice sygnalizują ZodError/DecimalDomainError.

## P03 — replay, gotówka i historyczne FX (wdrożone)
`replayLedger({instruments,operations,asOf})` waliduje Zod DTO i sortuje po occurredAt, a przy remisie zachowuje kolejność wejścia (w DB kolejność sequence). Bez odczytu zegara w silniku. Każda operacja sprawdza saldo własnej waluty; żaden prefiks nie może dać salda<0. API po dodaniu operacji wstecznej odtwarza całą historię, więc dodatnie saldo końcowe nie ukryje wcześniejszego debetu.

DEPOSIT/WITHDRAWAL zmienia subkonto i wpłaty netto o signedAmount×historycznyFX. BUY/SELL zmienia subkonto o cashDeltaLocal z P02, a bazę kosztu PLN liczy osobno przy każdym BUY z historycznym FX (z prowizją). SELL uwalnia proporcję pozostałego kosztu bazowego i realizuje wynik według FX sprzedaży. Całkowite zamknięcie zeruje bazę kosztu. Wpłaty netto mogą być≤0, np. po wypłacie przy innym FX; nie są stopą zwrotu.

FX to dodatni decimal string≤16 cyfr całkowitych i12 ułamkowych, zgodny z numeric(28,12); dlaPLN dokładnie1. Brak kursu, zły kierunek bazowy (PLN≠1), przyszła data kursu względem operacji i przyszła operacja względem asOf są błędami. Źródło obecnego wejścia=manual. Historyczny FX może być stary; reguły aktualnej wyceny/stale to P04.

Obliczenia pośrednie zachowują40 cyfr znaczących. Snapshot końcowych sald, wpłat netto, kosztu bazowego i realizedBase ma10 miejsc HALF_EVEN z kontrolą numeric(28,10); źródłowe operacje i kursy nie są zaokrąglane do snapshotu. Średnia bazowa zachowuje precision40. Przy kolejnym replay zawsze liczymy od operacji, a nie zaokrąglonych snapshotów.

Golden3: wpłata20USD FX4, BUY0.125×80+0.5USD FX4 → gotówka9.5USD, koszt pozycji42PLN, wpłaty netto80PLN. Wartość47.25 i unrealized5.25 przy cenie90/FX4.2 sprawdzone jako arytmetyka referencyjna; kompletna wycena i kontrola quote/fx freshness nadal P04.

P03 API/UI zapisuje wyłącznie wpłaty/wypłaty. Pozostałe typy istnieją w czystym silniku, bez domniemanej integracji z tabelą cash_operations.
