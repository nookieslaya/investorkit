import { CsvImport } from './csv-import';
import { useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChartNoAxesCombined, Wallet, LayoutDashboard, ArrowLeftRight, FlaskConical, BookOpen, Files, Moon, Sun, Plus, ShieldCheck, LogOut, ArrowRight } from 'lucide-react';
import { createPortfolioSchema } from '@investorkit/shared';
import { Button } from '../components/ui/button';
import { auth, listPortfolios, createPortfolio } from '../lib/api';
import { InvestmentsOverview } from './investments';
import { CashOverview } from './cash';
import { PurchaseSimulator } from './simulator';
import { JournalOverview } from './journal';
import { RiskOverview } from './risk';
import { pl } from '../i18n/pl';
type Screen = 'overview' | 'simulator' | 'operations' | 'risk' | 'journal' | 'imports';
const subscribeScreen = (listener: () => void) => { window.addEventListener('hashchange', listener); return () => window.removeEventListener('hashchange', listener); };
const readScreen = (): Screen => location.hash === '#imports' ? 'imports' : location.hash === '#journal' ? 'journal' : location.hash === '#risk' ? 'risk' : location.hash === '#simulator' ? 'simulator' : ['#operations', '#cash-operations'].includes(location.hash) ? 'operations' : 'overview';
type Theme = 'light' | 'dark';
function currentTheme(): Theme {
  try { const stored = localStorage.getItem('investorkit-theme'); if (stored === 'dark' || stored === 'light') return stored; } catch { /* Storage may be unavailable. */ }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function App() {
  const screen = useSyncExternalStore(subscribeScreen, readScreen);
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const session = auth.useSession();
  const queryClient = useQueryClient();
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next);
    try { localStorage.setItem('investorkit-theme', next); } catch { /* Theme still works in memory. */ }
  }
  const [logoutError, setLogoutError] = useState('');
  async function logout() {
    setLogoutError('');
    try { const result = await auth.signOut(); if (result.error) throw new Error(); queryClient.clear(); }
    catch { setLogoutError('Nie udało się wylogować. Spróbuj ponownie.'); }
  }
  return <div data-theme={theme} className="app-shell">
    <a className="skip-link" href="#main">Przejdź do treści</a>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="InvestorKit — strona główna"><span className="brand-icon"><ChartNoAxesCombined size={23} /></span>Investor<span>Kit</span></a>
      <div className="workspace"><span className="workspace-dot" /> PRZESTRZEŃ INWESTORA <span className="beta">ALPHA</span></div>
      <nav aria-label="Nawigacja główna"><a className={`nav-item ${screen === 'overview' ? 'active' : ''}`} href="#investments" aria-current={screen === 'overview' ? 'page' : undefined}><LayoutDashboard size={19} />{pl.overview}</a>
        {session.data && <a className={`nav-item ${screen === 'operations' ? 'active' : ''}`} href="#operations" aria-current={screen === 'operations' ? 'page' : undefined}><ArrowLeftRight size={19} /><span>Operacje</span></a>}
        {session.data && <a className={`nav-item ${screen === 'simulator' ? 'active' : ''}`} href="#simulator" aria-current={screen === 'simulator' ? 'page' : undefined}><FlaskConical size={19} /><span>{pl.simulator}</span></a>}
        {session.data && <a className={`nav-item ${screen === 'risk' ? 'active' : ''}`} href="#risk" aria-current={screen === 'risk' ? 'page' : undefined}><ShieldCheck size={19} /><span>{pl.scenarios}</span></a>}
        {session.data && <a className={`nav-item ${screen === 'imports' ? 'active' : ''}`} href="#imports" aria-current={screen === 'imports' ? 'page' : undefined}><ArrowLeftRight size={19} /><span>{pl.imports}</span></a>}
        {session.data && <a className={`nav-item ${screen === 'journal' ? 'active' : ''}`} href="#journal" aria-current={screen === 'journal' ? 'page' : undefined}><BookOpen size={19} /><span>{pl.journal}</span></a>}
        <div className="nav-item future"><Files size={19} /><span>{pl.reports}</span><span className="soon">Wkrótce</span></div>
      </nav>
      <div className="sidebar-bottom"><ShieldCheck size={22} /><strong>Twoje decyzje. Twoje dane.</strong><p>Bez połączenia z brokerem.<br />Bez wykonywania transakcji.</p><span className="version">Wersja rozwojowa · 0.6</span></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div className="breadcrumb">Przestrzeń inwestora <span>/</span> <strong>{screen === 'imports' ? pl.imports : screen === 'journal' ? pl.journal : screen === 'risk' ? pl.scenarios : screen === 'simulator' ? pl.simulator : screen === 'operations' ? 'Operacje' : 'Przegląd'}</strong></div><div className="top-actions"><Button variant="ghost" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Włącz jasny motyw' : 'Włącz ciemny motyw'}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</Button>{session.data && <Button variant="ghost" onClick={() => void logout()}><LogOut size={17} /><span>Wyloguj</span></Button>}</div></header>
      <main id="main" className="content">
        <div className="page-heading"><div><div className="eyebrow">SPOKOJNIE. ŚWIADOMIE. PO SWOJEMU.</div><h1>Twój portfel, jasno<span>.</span></h1><p>Jedno miejsce, żeby lepiej rozumieć swoje inwestycje.</p></div><span className="status-badge"><span />Wersja rozwojowa</span></div>
        {logoutError && <p role="alert" className="error">{logoutError}</p>}
        {session.isPending ? <div className="panel p-8" role="status">Sprawdzanie sesji…</div> : session.error ? <div className="panel p-8"><h2>Nie można sprawdzić sesji</h2><p className="error" role="alert">Sprawdź połączenie i dostępność serwera.</p><Button onClick={() => void session.refetch()}>Spróbuj ponownie</Button></div> : session.data ? <PortfolioOverview screen={screen} /> : <Welcome />}
        <footer className="footer"><span>InvestorKit · Narzędzie do analizy i własnych decyzji</span><span>Ceny ręczne lub dzienne EOD · Bez notowań na żywo</span></footer>
      </main>
    </div>
  </div>;
}
function Welcome() {
  return <div className="welcome-grid"><section className="welcome-story"><span className="pill">ZACZNIJ OD DOBRYCH PODSTAW</span><h2>Więcej zrozumienia.<br /><span>Mniej zgadywania.</span></h2><p>Budujemy prostą przestrzeń do analizy portfela. Utwórz konto i przygotuj swój pierwszy portfel.</p><div className="steps"><div><span>01</span><div><strong>Twój własny portfel</strong><p>Jedno konto, prywatne dane, przejrzysty start.</p></div></div><div><span>02</span><div><strong>Wynik z jasnymi założeniami</strong><p>Gotówka i kursy historyczne już działają. Ręczne ceny i przejrzysta wycena pokazują daty danych.</p></div></div><div><span>03</span><div><strong>Decyzja przed zakupem</strong><p>Symulator porównuje zakup z nowych środków lub istniejącej gotówki.</p></div></div></div><div className="development-note"><ShieldCheck size={20} /><p>To wersja rozwojowa. Działają konto, portfel oraz wpłaty i wypłaty w trzech walutach. Działają ręczne ceny i wycena inwestycji. Import XTB jest w przygotowaniu.</p></div></section><AuthForm /></div>;
}
function AuthForm() {
  const [register, setRegister] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get('email')); const password = String(fields.get('password'));
    try {
      const result = register ? await auth.signUp.email({ name: String(fields.get('name')).trim(), email, password }) : await auth.signIn.email({ email, password });
      if (result.error) setError(register ? 'Nie można utworzyć konta. Sprawdź dane lub przejdź do logowania.' : 'Nieprawidłowy email lub hasło. Spróbuj ponownie.');
    } catch { setError('Nie można połączyć się z serwerem. Spróbuj ponownie.'); }
    finally { setBusy(false); }
  }
  return <section className="panel auth-card" aria-labelledby="auth-title"><div className="auth-icon"><Wallet size={24} /></div><h2 id="auth-title">{register ? 'Zacznij swój portfel' : 'Dobrze Cię widzieć'}</h2><p>{register ? 'Utwórz lokalne konto testowe.' : 'Zaloguj się do swojego portfela.'}</p><form onSubmit={event => void submit(event)} aria-busy={busy}>
    {register && <label>Imię<input name="name" autoComplete="given-name" required minLength={1} maxLength={80} placeholder="Jak masz na imię?" /></label>}
    <label>Adres email<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="ty@example.com" /></label>
    <label>Hasło<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} aria-describedby="password-hint auth-error" /></label><small id="password-hint">Minimum 12 znaków.</small>
    <p id="auth-error" role="alert" className="error">{error}</p><Button className="w-full" type="submit" disabled={busy}>{busy ? 'Chwila…' : register ? 'Utwórz konto' : 'Zaloguj się'}<ArrowRight size={17} /></Button>
  </form><div className="auth-switch">{register ? 'Masz już konto?' : 'Pierwszy raz tutaj?'} <button type="button" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Zaloguj się' : 'Utwórz konto'}</button></div></section>;
}
function PortfolioOverview({ screen }: { screen: Screen }) {
  const query = useQuery({ queryKey: ['portfolios'], queryFn: listPortfolios }); const client = useQueryClient(); const [name, setName] = useState('Mój portfel'); const [validationError, setValidationError] = useState('');
  const create = useMutation({ mutationFn: createPortfolio, onSuccess: () => client.invalidateQueries({ queryKey: ['portfolios'] }) });
  if (query.isPending) return <div className="panel p-8" role="status">Pobieranie portfela…</div>;
  if (query.isError) return <div className="panel p-8"><h2>Nie udało się pobrać portfela</h2><p role="alert" className="error">{query.error.message}</p><Button onClick={() => void query.refetch()}>Spróbuj ponownie</Button></div>;
  const portfolio = query.data[0];
  if (!portfolio) return <section className="panel setup-card"><span className="auth-icon"><Wallet size={28} /></span><span className="eyebrow">PIERWSZY KROK</span><h2>Przygotuj miejsce na swoje inwestycje</h2><p>Nazwij portfel. Jego walutą bazową będzie PLN.</p><form className="setup-form" onSubmit={event => {
    event.preventDefault(); const parsed = createPortfolioSchema.safeParse({ name, baseCurrency: 'PLN' });
    if (!parsed.success) { setValidationError('Podaj nazwę od 1 do 80 znaków.'); return; }
    setValidationError(''); create.mutate(parsed.data);
  }}><label>Nazwa portfela<input value={name} onChange={e => setName(e.target.value)} required maxLength={80} aria-describedby="create-error" /></label><Button type="submit" disabled={create.isPending}><Plus size={18} />{create.isPending ? 'Tworzenie…' : 'Utwórz portfel'}</Button><p id="create-error" className="error" role="alert">{validationError || create.error?.message}</p></form></section>;
  return <><div className="portfolio-title"><h2><Wallet size={20} />{portfolio.name}</h2><span className="pill">WALUTA BAZOWA · PLN</span></div><nav className="portfolio-tabs" aria-label="Sekcje portfela">{([['overview', '#investments', 'Inwestycje'], ['market', '#market-data', 'Ceny dzienne'], ['simulator', '#simulator', pl.simulator], ['operations', '#operations', 'Operacje'], ['risk', '#risk', pl.scenarios], ['journal', '#journal', pl.journal], ['imports', '#imports', pl.imports]] as const).map(([key, href, label]) => <a key={key} href={href} aria-current={screen === key ? 'page' : undefined}>{label}</a>)}</nav>{screen === 'imports' ? <CsvImport portfolioId={portfolio.id} /> : screen === 'journal' ? <JournalOverview portfolioId={portfolio.id} /> : screen === 'risk' ? <RiskOverview portfolioId={portfolio.id} /> : screen === 'simulator' ? <PurchaseSimulator portfolioId={portfolio.id} /> : screen === 'operations' ? <section id="operations"><CashOverview portfolioId={portfolio.id} /></section> : <InvestmentsOverview portfolioId={portfolio.id} />}</>;
}
