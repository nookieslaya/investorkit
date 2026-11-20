import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createInstrumentSchema } from '@investorkit/shared';
import type { Instrument } from '@investorkit/shared';
import { addInstrument, bindMarket, chooseMarketSource, loadMarketStates, refreshMarket, searchMarket } from '../lib/api';
import { Button } from '../components/ui/button';
import { FormSelect } from '../components/ui/form-select';
import { formatAmount, formatDate } from '../lib/format';
type Candidate = Awaited<ReturnType<typeof searchMarket>>['items'][number];
const statusLabel = (status: string) => ({ ok: 'Ostatnia aktualizacja poprawna', ready: 'Oczekuje na aktualizację',
  BUDGET_BLOCKED: 'Wstrzymane: limit lub blokada dostawcy', AUTH_ERROR: 'Błąd dostępu do dostawcy', QUOTA_ERROR: 'Wyczerpany limit dostawcy',
  ACCESS_DENIED: 'Dostawca odmówił dostępu', CURRENCY_MISMATCH: 'Waluta odpowiedzi nie pasuje', NO_EOD: 'Brak ceny EOD',
}[status] ?? 'Aktualizacja nie powiodła się — zachowano ostatnią poprawną cenę');
export function MarketInstrumentPicker({ instruments, manualForm, onConnected }: {
  instruments: Instrument[]; manualForm: ReactNode; onConnected: (id: string) => void;
}) {
  const client = useQueryClient();
  const states = useQuery({ queryKey: ['market'], queryFn: loadMarketStates, retry: false, refetchInterval: 60000 });
  const [query, setQuery] = useState(''); const [mic, setMic] = useState('XWAR');
  const [debounced, setDebounced] = useState(''); const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [target, setTarget] = useState('new'); const [createdId, setCreatedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 600); return () => clearTimeout(timer); }, [query]);
  const search = useQuery({ queryKey: ['market-search', debounced, mic], queryFn: () => searchMarket(debounced, mic),
    enabled: states.data?.enabled === true && debounced.length >= 3 && /^[A-Z0-9]{4}$/.test(mic), staleTime: 15 * 60000, retry: false, refetchOnWindowFocus: false });
  const mutation = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: async () => {
    await Promise.all(['market', 'instruments', 'valuation', 'risk', 'quotes', 'market-quotes'].map(key => client.invalidateQueries({ queryKey: [key] })));
  } });
  async function action(run: () => Promise<unknown>) {
    setMessage('');
    try { await mutation.mutateAsync(run); setMessage('Zapisano źródło danych. Wycenę przeliczono.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się zapisać źródła.'); }
  }
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const chosen = candidate;
    if (!chosen) return;
    await action(async () => {
      let id = target === 'new' ? createdId : target;
      if (!id) {
        const input = createInstrumentSchema.safeParse({ name: String(fields.get('name')), symbol: chosen.symbol.toUpperCase(), mic: chosen.mic,
          currency: chosen.currency, type: fields.get('type'), quantityScale: Number(fields.get('quantityScale')), isin: null, issuerCountry: null });
        if (!input.success) throw new Error('Sprawdź nazwę, typ, symbol i precyzję ilości. Możesz też dodać instrument ręcznie.');
        const created = await addInstrument(input.data); id = created.id; setCreatedId(id);
        await client.invalidateQueries({ queryKey: ['instruments'] });
      }
      await bindMarket(id, chosen.id);
      setCandidate(null); setCreatedId(null); onConnected(id);
    });
  }
  if (states.isPending) return <><p className="cash-help" role="status">Sprawdzanie dostępności wyszukiwania…</p>{manualForm}</>;
  if (!states.data?.enabled) return <><p className="cash-help">Wyszukiwanie Marketstack jest niedostępne. Dodaj instrument ręcznie.</p>{manualForm}</>;
  const matched = instruments.find(row => row.id === target);
  return <div className="market-picker">
    <h4>Wyszukaj instrument w Marketstack</h4>
      <div className="cash-fields"><label>Nazwa lub ticker (minimum 3 znaki)<input value={query} maxLength={80} onChange={event => { setQuery(event.target.value); setCandidate(null); setCreatedId(null); }} /></label><label>Giełda (MIC)<input value={mic} maxLength={4} onChange={event => { setMic(event.target.value.toUpperCase()); setCandidate(null); setCreatedId(null); }} placeholder="np. XWAR, XNAS, ARCX" /></label></div>
      <p className="cash-help">Wybierz konkretne notowanie i potwierdź walutę. Symbole dostawcy mogą różnić się od symbolu brokera. Wyszukiwanie potwierdza walutę ceną EOD i zużywa do 4 zapytań przed ewentualnym ponowieniem.</p>
      <div aria-live="polite">{search.isFetching ? <p>Wyszukiwanie i potwierdzanie waluty…</p> : query.trim() === debounced && debounced.length >= 3 && search.data ? <>
        <ul className="market-results">{search.data.items.map(item => <li key={item.id}><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => { setCandidate(item); setCreatedId(null); setMessage(''); }}><span><strong>{item.name}</strong><small>{item.symbol} · {item.mic} · {item.currency} · {item.type ?? 'typ do potwierdzenia'} · EOD</small></span></Button></li>)}</ul>
        {search.data.items.length === 0 && <p>Brak potwierdzonych wyników. Doprecyzuj nazwę lub dodaj instrument ręcznie.</p>}{search.data.partial && <p className="cash-help">Lista może być niepełna. Doprecyzuj nazwę, aby znaleźć właściwy instrument.</p>}
      </> : null}</div>
      {search.isError && <p role="alert" className="error">{search.error.message}</p>}
      {candidate && <form aria-label="Wybór instrumentu Marketstack" key={candidate.id} onSubmit={event => void connect(event)}><fieldset disabled={mutation.isPending}>
        <p><strong>{candidate.name}</strong> · {candidate.symbol} · {candidate.mic} · {candidate.currency}</p>
        <FormSelect label="Dodaj lub połącz instrument" value={target} onValueChange={value => { setTarget(value); setCreatedId(null); }} options={[{ value: 'new', label: 'Dodaj nowy instrument' }, ...instruments.map(item => ({ value: item.id, label: `${item.symbol} · ${item.name} · ${item.mic} · ${item.currency}` }))]} />
        {target === 'new' && !createdId && <><label>Nazwa instrumentu<input name="name" defaultValue={candidate.name} required maxLength={120} /></label><div className="cash-fields"><FormSelect label="Typ instrumentu (potwierdź)" name="type" required placeholder="Wybierz typ" options={[{ value: 'STOCK', label: 'Akcja' }, { value: 'ETF', label: 'ETF' }]} /><label>Precyzja ilości (0–10 miejsc)<input name="quantityScale" type="number" min={0} max={10} step={1} defaultValue={0} required /></label></div></>}
        {createdId && <p>Instrument został dodany. Ponów połączenie bez tworzenia duplikatu.</p>}
        {matched && <p>Łączysz {matched.symbol} ({matched.mic}, {matched.currency}) → {candidate.symbol} ({candidate.mic}, {candidate.currency}).</p>}
        <p className="cash-help">Wybierasz ceny zamknięcia Marketstack do wyceny. Zapisane ceny ręczne pozostają dostępne po zmianie źródła. ISIN i kraj nie są uzupełniane automatycznie.</p>
        <Button type="submit">{mutation.isPending ? 'Zapisywanie…' : target === 'new' && !createdId ? 'Dodaj instrument z Marketstack' : 'Połącz z Marketstack'}</Button>
      </fieldset></form>}

    <p role="status">{message}</p>
    <details className="manual-instrument"><summary>Dodaj instrument ręcznie</summary>{manualForm}</details>
  </div>;
}

export function MarketDataPanel({ instruments, onAddInstrument }: { instruments: Instrument[]; onAddInstrument: () => void }) {
  const client = useQueryClient();
  const states = useQuery({ queryKey: ['market'], queryFn: loadMarketStates, retry: false, refetchInterval: 60000 });
  useEffect(() => {
    if (location.hash !== '#market-data') return;
    const panel = document.getElementById('market-data');
    panel?.scrollIntoView({ block: 'start' });
    panel?.focus({ preventScroll: true });
  }, [states.isPending, states.data?.enabled]);
  const [message, setMessage] = useState('');
  const mutation = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: async () => {
    await Promise.all(['market', 'valuation', 'risk', 'quotes'].map(key => client.invalidateQueries({ queryKey: [key] })));
  } });
  async function action(run: () => Promise<unknown>) {
    setMessage('');
    try { await mutation.mutateAsync(run); setMessage('Zapisano źródło danych. Wycenę przeliczono.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się zmienić źródła.'); }
  }
  if (states.isPending) return <p id="market-data" tabIndex={-1} className="cash-help" role="status">Sprawdzanie dostępności cen EOD…</p>;
  if (!states.data?.enabled) return <p id="market-data" tabIndex={-1} className="cash-help">Automatyczne ceny EOD są wyłączone. Możesz korzystać z ręcznych cen i kursów.</p>;
  return <section id="market-data" tabIndex={-1} className="panel market-panel" aria-labelledby="market-heading">
    <h3 id="market-heading">Ceny dzienne · Marketstack</h3>
    <p className="cash-help">Ceny zamknięcia, bez notowań na żywo. Kompletność i świeżość wyceny pokazujemy osobno powyżej. Limit aplikacji: {states.data.used}/{states.data.limit} zapytań w miesiącu; obejmuje także nieudane próby. Dzienna aktualizacja dotyczy zmapowanych otwartych pozycji.</p>
    <p className="cash-help">Dodawanie i łączenie instrumentów znajdziesz w sekcji <a href="#instrument-editor" onClick={onAddInstrument}>Uzupełnij swój portfel → Instrument</a>.</p>
    <ul className="market-bindings">{states.data.items.map(row => <li key={row.instrumentId}>
      <strong>{instruments.find(item => item.id === row.instrumentId)?.symbol ?? row.symbol} · {row.mic} · {row.currency}</strong>
      <p>Źródło wyceny: {row.mode === 'marketstack' ? 'Marketstack EOD' : 'wpisy ręczne'}.</p>
      <p>{row.quote ? <>Cena zamknięcia z {row.quote.sessionDate} · Marketstack: <strong>{formatAmount(row.quote.price)} {row.currency}</strong><small>Pobrano: {formatDate(row.quote.fetchedAt)}. Świeżość liczymy od daty sesji.</small></> : 'Brak zapisanej ceny EOD. Nie zastępujemy jej zerem.'}</p>
      <p className={row.status === 'ok' ? 'cash-help' : 'data-issue'}>Ostatnia próba: {row.lastAttemptAt ? formatDate(row.lastAttemptAt) : 'jeszcze nie wykonano'} · {statusLabel(row.status)}</p>
      <div className="market-actions"><Button variant="outline" disabled={mutation.isPending} onClick={() => void action(() => chooseMarketSource(row.instrumentId, row.mode === 'marketstack' ? 'manual' : 'marketstack'))}>{row.mode === 'marketstack' ? 'Użyj cen ręcznych' : 'Użyj Marketstack'}</Button><Button variant="ghost" disabled={mutation.isPending || row.mode !== 'marketstack'} onClick={() => void action(() => refreshMarket(row.instrumentId))}>Odśwież EOD</Button></div>
      <small>Maksymalnie jedna próba dziennie UTC, także po błędzie. Odświeżenie nie zmienia daty sesji. Weekend sam w sobie nie jest błędem.</small>
    </li>)}</ul>
    <p role="status">{message}</p>
  </section>;
}
