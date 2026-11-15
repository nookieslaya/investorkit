# Kontynuacja w VS Code / Codex

## Przygotowanie
Otwórz katalog główny investorkit jako workspace VS Code. Zachowaj AGENTS.md w katalogu głównym. Potrzebujesz Node24 i PostgreSQL17 (najprościej przez Docker Compose).

```bash
npm ci
npm run setup:env
docker compose up -d --wait
npm run build:packages
npm run db:migrate
npm run dev
```

Dane lokalnego Compose znajdują się w .env.example. Wygenerowane .env nie jest śledzone. Nie przenoś sekretów z innych projektów. Szczegóły DB testowej i komend testów są w README.

## Pierwsza wiadomość do Codexa

> Kontynuujemy istniejący projekt InvestorKit. Najpierw przeczytaj AGENTS.md, README.md, docs/HANDOFF.md, docs/08-backlog.md oraz docs/VERIFICATION.md. Nie generuj projektu od nowa. Sprawdź stan repozytorium. Zajmij się wyłącznie domknięciem foundation: uruchomieniem Compose, scenariusza Playwright i wizualnym sprawdzeniem desktop/mobile oraz light/dark mode. Wykorzystaj odizolowaną bazę testową, nie bazę z prawdziwymi danymi. Popraw wykryte błędy w ramach tych zadań, uruchom adekwatne kontrole i zaktualizuj statusy dokumentacji. Jeśli kontrolę blokuje środowisko, opisz dokładną blokadę i nie oznaczaj jej jako zaliczonej. Nie zaczynaj jeszcze silnika finansowego, AI, importu, płatności ani automatycznych raportów.

## Kolejny etap
Po domknięciu F03/F08/F09/F11: F12 (OpenAPI), następnie P01–P07 (silnik i golden cases z docs/04-calculations.md). Dopiero potem integracja operacji i dashboardu. Wybieraj po jednym małym zadaniu lub ściśle powiązanej grupie.

## Git
Repozytorium przekazano z lokalnym commitem bazowym, bez skonfigurowanego remote. Wersję można sprawdzić przez git log -1. Po utworzeniu prywatnego repozytorium zdalnego możesz podłączyć jego adres:

```bash
git remote add origin ADRES_TWOJEGO_REPOZYTORIUM
git push -u origin main
```
Nie wstawiaj hasła ani tokena do adresu remote. Te komendy są instrukcją dla właściciela; w tej sesji niczego nie opublikowano.
Jeśli korzystasz wyłącznie z archiwum ZIP, źródła mają tę samą strukturę; do zachowania pełnego commita dołączony jest plik investorkit.bundle (instrukcja obok archiwum).
