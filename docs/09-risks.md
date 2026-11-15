# Ryzyka i pytania otwarte
| ID | Ryzyko / status | Działanie i bramka |
|---|---|---|
| K01 | Niewielka gotowość do płacenia mimo szerokiego briefu | MVP-A i rozmowy przed AI; retencja i zaproszenie do konkretnego planu |
| K02 | Wynik mylony z podatkowym lub czasowym | Jawna semantyka docs04, brak deklaracji FIFO/PIT/TWR |
| K03 | Niepełny ledger i błędne FX | Walidacja wszystkich stanów, niekompletność wyniku widoczna |
| K04 | XTB format nieznany | Adapter disabled do próbki, nie zgadywać CSV/XLSX |
| K05 | Raport ujawniony innemu użytkownikowi | Private cache per owner, ACL przed lookup, test hash collision scope |
| K06 | Halucynacje/prompt injection | Zod, cytaty stron, tekst raportu jako dane, brak narzędzi wykonawczych |
| K07 | Niekontrolowane koszty AI | Atomowy reserve, kill switch, bez retry nieznanego usage |
| K08 | SSRF i złośliwy PDF | Fetch allowlist/egress i isolated parser; feature off bez ochrony |
| K09 | Brak praw do feedów/raportów | Manual MVP; source policy review przed V2/public cache |
| K10 | Zakres za duży dla pojedynczego developera | Małe PR-y i MVP-A przed B; szacunki zweryfikować po foundation |
| K11 | Niepełny proces auth produkcyjnego | Email/reset, rotacja sekretów, limity i testy przed publicznym pilotem |
| K12 | Brak repo zdalnego i Dockera w Work | Archiwum źródeł; CI przygotowane, DB/E2E nieoznaczane jako wykonane |

Otwarte decyzje: próbka XTB, dostawca maila, hosting/bloby i region, model AI i jego aktualny cennik przed R04, reguła weryfikacji źródeł publicznych. Nie blokują lokalnego foundation. Zmiana bazowej waluty na wiele walut interfejsu poza pierwszym pilotem; instrumenty pozostają PLN/EUR/USD. Przed wdrożeniem zweryfikować politykę prywatności i warunki produktu; ten dokument nie stanowi analizy prawnej.
