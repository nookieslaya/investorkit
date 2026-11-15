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
