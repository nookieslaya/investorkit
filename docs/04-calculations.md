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
6. SELL przy zerowej ilości, niedostateczna gotówka, ujemna opłata i brak historycznego FX → błąd. API odrzuca zapis future quote; historyczna wycena pomija przyszłe rekordy i zgłasza diagnostykę przy braku wcześniejszej ceny. Dwie identyczne legalne transakcje z różnymi kluczami nie są automatycznie duplikatem.
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

## P04 — wycena (wdrożone)
`valuePortfolio` waliduje datę wyceny, odtwarza prefix operacji occurredAt≤asOf i korzysta z niezaokrąglonego stanu decimal40. Ceny i FX wybiera po największym asOf≤data wyceny; równe timestampy rozstrzyga kolejność wejścia (DB sequence). Dane przyszłe są pomijane. Jeśli dostępne są tylko przyszłe rekordy, diagnostyka FUTURE_QUOTE/FUTURE_FX zastępuje pozorną wartość. API nie pozwala zapisywać przyszłych cen/kursów ani pytać o przyszły stan.

Wartość pozycji=quantity×price×FX, wartość gotówki=amount×FX. PLN używa jawnej tożsamości1, bez sztucznego timestampu rynkowego. Zerowa gotówka obca nie wymaga FX. Zamknięte pozycje nie wymagają cen. Cena0 wpisana ręcznie jest ważną ceną, a nie brakiem. Koszt i realizedBase zawsze po historycznych FX transakcji, niezależne od aktualnych kursów.

Domyślne progi quote/fx=72h; age==próg jest ważne, age>próg=stale. Silnik dopuszcza argumenty progów (0<hours≤8760), API używa zapisanych ustawień portfela, domyślnie72h. Nie ma kalendarza sesji giełdowych. Brak/stale uniemożliwia wycenę odpowiedniej pozycji/subkonta: valueBase/unrealized/udział=null. pricedSubtotal sumuje wyłącznie świeżo wycenione części. complete=false → totalValue,pnl,pnlPct=null; nie prezentujemy subtotalu jako pełnej wartości.

Przy kompletności P/L=pełna wartość−historyczne wpłaty netto PLN (w tym FX gotówki i prowizje). Procent=P/L/wpłaty netto×100 tylko dla dodatniej bazy, inaczej null z NON_POSITIVE_BASE. Udział pozycji względem pełnej wartości z gotówką, dla niepełnego/zerowego mianownika null. Snapshot końcowy money HALF_EVEN10 z ochroną overflow; procenty zachowują40 cyfr, UI zaokrągla HALF_EVEN2 bez konwersji kwot do number. Zakres dat obejmuje faktycznie wykorzystane ceny/FX, a wybrane stare rekordy są widoczne osobno z diagnostyką i źródłem.

Golden3 z wpłatą20USD FX4, zakupem0.125×80+0.5 i ceną90/FX4.2: pozycja47.25, koszt42, unrealized5.25, gotówka39.9, łączna wartość87.15 i P/L7.15 względem wpłat80. Nie utożsamiać P/L portfela z samym unrealized akcji (tu różnica1.9 z FX gotówki). Golden7: brak danych → brak pełnego P/L; niepozytywne wpłaty netto → procentnull.

## P05 — symulator (wdrożone)
`simulatePurchase(context,input)` przyjmuje ten sam jawny asOf/instrumenty/ledger/ceny/FX co wycena. Hipotetyczne DEPOSIT/BUY istnieją wyłącznie w lokalnej kopii tablicy. Koszt, ilość, cash i średnia pochodzą ze wspólnego replay, bez osobnego salda. Delta wartości korzysta z niezaokrąglonego stanu wyceny, dopiero wynik przechodzi HALF_EVEN10.

`dividedByFloor` wyznacza dodatnią ilość przed redukcją do standardowego kontekstu40: pomocniczy, izolowany kontekst decimal100/ROUND_FLOOR, przemnożenie przez10^scale, dzielenie całkowite i cofnięcie skali. Chroni przed zaokrągleniem prawie całkowitego ilorazu w górę przed podłogą; ilość wynikowa nadal musi mieścić się w granicach wejściowych ledgeru18/10. Standardowe pozostałe obliczenia zachowują40/HALF_EVEN. Budżet≤fee lub ilość0 → BUDGET_TOO_SMALL, nie pobieramy opłaty przy braku zakupu.

Bieżący świeży FX jest także jawnym kursem hipotetycznej wpłaty/BUY; nie zmienia historycznego kosztu istniejących operacji. Dla nowej otwartej pozycji bez żadnych notowań cena zakupu jest referencją oznaczoną `scenario`; brak/stale/future pozostałych danych nie zostaje ukryty. Golden4 PASS: q3/koszt905/reszta95, wartość995 przy istniejącej gotówce i1995 przy nowych środkach do portfela1000. Wynik jest snapshotem, bez trwałego zapisu scenariusza.

### Wynik dokupowanej części i dopłata
Odpowiedź symulacji `impact` rozdziela: newMoneyBase=budget×FX dla NEW_MONEY (inaczej0), commissionBase=fee×FX, priceDifferenceBase=q×(referencePrice−purchasePrice)×FX, netEffectBase=priceDifferenceBase−commissionBase. netEffectPct=netEffectBase/(actualCost×FX)×100. To niezrealizowany wynik tylko dokupowanej części według referencji, nie prognoza ani stopa całego portfela. Istniejące pozycje i wpłaty nie zwiększają tego wyniku. Obliczenia decimal40, końcowe kwoty HALF_EVEN10, procent pełnej precyzji.

Przy kompletnej wycenie before.totalValue + newMoneyBase + priceDifferenceBase − commissionBase = after.totalValue przed końcowym zaokrągleniem. Gdy cena kupowanego instrumentu jest brakująca/stara/przyszła, priceDifference/netEffect/procent sąnull. Braki w innych instrumentach pozostawiają wartość całego portfela=null, ale nie ukrywają znanego wyniku dokupowanej części. Dopłata zawsze pozostaje osobnym przepływem, a nie zyskiem.

Regresja zgłoszona przez użytkownika:80PLN, nowe środki1000, zakup10×100 bez prowizji, referencja70 → po780, wpłaty netto1080, nominalny P/L−300, zmiana wartości z dopłatą+700, wynik dokupowanej części−300/−30%. W interfejsie +700 nie jest główną metryką wyniku.

## P06 — koncentracja i stress (wdrożone)
`analyzeRisk(context,classifications,settings)` używa niezaokrąglonych wartości `valuePortfolioState`. Największa pozycja i Top3/5 sumują papiery według wartości malejąco, przy remisie instrumentId; mianownik to cała wartość z gotówką. Mniej niż3/5 pozycji oznacza sumę dostępnych. Samej gotówki nie liczymy do Top3/5; dla dodatniego portfela gotówkowego miary wynoszą0. Przekroczenie progu to porównanie pełnej precyzji `udział > próg`, nie ≥. Domyślne25/60/80% to ustawienia produktu, nie ocena bezpieczeństwa.

Grupy typ aktywów / waluta notowania i gotówki / kraj emitenta mają ten sam pełny mianownik. CASH pozostaje osobną kategorią, UNKNOWN zachowuje wartość i udział. Nie wnioskujemy kraju z symbolu/rynku/waluty, nie robimy look-through ETF. Brak metadanych nie usuwa pozycji z rachunku. Przy brakach cen/FX pełne udziały, Top3/5 i wyniki progów sąnull; kategoria z brakującą wyceną ma wartośćnull. Znane wartości innych kategorii nie są prezentowane jako pełny portfel. Zerowy mianownik daje NON_POSITIVE_BASE, bez dzielenia przez0.

`stressPortfolio(context,{scope,dropPct,instrumentId?})` wycenia bazowy stan i liczy spadek0–100% wyłącznie cen papierów: loss=wartość objętych pozycji×dropPct/100, totalAfter=totalBefore−loss. Pozycje objęte testem mają wartość×(1−dropPct/100); nieobjęte, gotówka, FX, ilość i koszty historyczne pozostają stałe. Udział po względem całego nowego portfela. INSTRUMENT wymaga otwartej pozycji, inaczej TARGET_NOT_HELD. To scenariusz, nie prognoza. Cały wynik bez IO/zegara i zapisu ledgeru.

Niepełna wycena → pełny wynik scenariusza/loss/procentnull i INCOMPLETE_VALUATION. Brak pozycji przy dodatniej gotówce → loss0, wartość gotówki stała. Spadek100% papierów może dać totalAfter0 (gdy brak gotówki): udziały po sąnull, ubytek procentowy100% względem dodatniego stanu przed. Empty0 daje loss0, lossPctnull/NON_POSITIVE_BASE. Ceny scenariusza nie przechodzą przez quoteInput/skalę DB i zachowują wynik ponad10 miejsc; nie zapisujemy ich jako notowań.

Kwoty końcowe HALF_EVEN10, procenty precision40. Ranking, grupy, straty i udziały nie korzystają z zaokrąglonych snapshotów. Wewnętrzny cashValues przenosi FinancialDecimal obok istniejącego positionValues; publiczny kontrakt wyceny pozostał bez zmian. Golden5:600/300/100 +cash100 → Top3=90.9090…%, największa54.5454…%; szok50% wszystkich papierów → po600, strata500, cash100. Szok50% tylko pozycji600 → po800, strata300. Wynik nie jest liczony z cen zaokrąglonych w UI.

Ustawienia wieku cen/FX są wspólne dla wyceny, symulatora i ryzyka. Zakres API to pełne godziny1–8760; engine valuePortfolio nadal dopuszcza jawne dodatnie wartości do8760, bez zegara. Historyczny FX ledgeru nie jest zmieniany ustawieniami bieżącej wyceny. Historia zmian ustawień i scenariuszy nie jest przechowywana w tym etapie.

## P07 — przegląd regresji zakończony 17.11.2026
P07 utrwala powyższą semantykę, bez zmian silnika/API i precyzji. Golden cases mają następujące pokrycie (pliki w tests/):

| Przypadek | Pokrycie i wynik |
|---|---|
| 1: koszt333 i średnia111 | unit/portfolio-position.test.ts; przekrojowy unit/portfolio-regression.test.ts |
| 2: realized38, koszt222, unrealized58 | position + regression: gotówka816, wartość1096, P/L96, zgodność wyceny/symulatora/ryzyka, spadek50%→956 |
| 3: USD0.125, historyczny FX4 i bieżący4.2 | unit/portfolio-ledger.test.ts, portfolio-valuation.test.ts i integration/investments-api.test.ts; pozycja47.25/koszt42, gotówka39.9, pełny P/L7.15 |
| 4: budżet1000/cena300/fee5 | unit/simulation.test.ts i integration/simulation-api.test.ts;3 szt.,905 koszt,95 reszta,995/1995 zależnie od finansowania |
| 5: koncentracja i spadki | unit/risk.test.ts i integration/risk-api.test.ts; cash stały,50% papierów→600, progi/UNKNOWN/jawna niepełność |
| 6: granice operacji i legalne powtórzenia | regression + investments-api: SELL bez ilości, brak cash/FX, fee<0, future quote; dwa różne klucze→dwa BUY, ten sam klucz→jeden zapis, konflikt body409; odrzucenie bez zmiany historii/notowań |
| 7: niedodatnie wkłady i niepełna wycena | valuation + regression: po wypłacie100 zostaje50 wartości i P/L50 przy wpłatach netto0; procentnull, lecz udział pozycji20% i spadek100% daje40. Wpłata10USD FX4/wypłata10USD FX5→wkłady−10, P/L10, procentnull. Brak ceny→pełna wartość/P&Lnull |

Dodatkowe regresje w portfolio-regression.test.ts:18 kombinacji trzech walut, obu finansowań i skal ilości0/3/10. Budżet100.25/cena3.2/fee0.15 daje odpowiednio ilości31/31.281/31.28125, koszty99.35/100.2492/100.25 i reszty0.9/0.0008/0. Oczekiwania to literalne liczby, niezależne od kodu liczącego wynik. P/L to sama ujemna prowizja, dopłata nie stanowi zysku.

Dwa BUY po0.0000000001 szt.×0.5 odejmują łącznie0.0000000001 od cash; każdy z osobna nie może być zaokrąglony do0 przed dalszym replay. Pełny SELL zeruje ilość i koszt. Maksymalna kwota numeric(28,10) pozostaje poprawna, przekroczenie przez sumę/FX/cenę wyceny jest odrzucane STORAGE_OVERFLOW. Osobny próg FX1h: age==1h poprawne,1ms później STALE_FX. Istniejące testy nadal obejmują0/100%, brak/stale/future cen/FX, zerowy mianownik, precyzję40 i brak zapisów symulacji.

To zestaw deterministycznych regresji, nie dowód poprawności wszystkich możliwych historii. Koszt średni pozostaje analityczny; P07 nie dodaje podatków, nowych miar stopy zwrotu, importu ani nowych widoków.
