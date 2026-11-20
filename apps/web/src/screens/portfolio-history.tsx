import { quoteSourceLabel } from '../lib/format';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { PortfolioHistoryQuery } from '@investorkit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import { FormSelect } from '../components/ui/form-select';
import { captureValuation, loadPortfolioHistory, loadValuationSnapshot } from '../lib/api';
import { formatDate, formatMoney, formatPercent, localNow } from '../lib/format';
const recordedTime = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Europe/Warsaw' });
const formatRecordedTime = (date: string) => recordedTime.format(new Date(date));
const plurals = new Intl.PluralRules('pl');
const recordWord = (count: number) => ({ one: 'zapis', few: 'zapisy', many: 'zapisów', other: 'zapisu', zero: 'zapisów', two: 'zapisy' })[plurals.select(count)];
const money = (value: string | null) => value === null ? '—' : `${formatMoney(value)} PLN`;
const issueNames = { MISSING_QUOTE: 'brak ceny', STALE_QUOTE: 'nieaktualna cena', FUTURE_QUOTE: 'cena z przyszłości', MISSING_FX: 'brak kursu', STALE_FX: 'nieaktualny kurs', FUTURE_FX: 'kurs z przyszłości' };
export function PortfolioHistory({ portfolioId }: { portfolioId: string }) {
  const [days, setDays] = useState('30');
  const [range, setRange] = useState<PortfolioHistoryQuery | null>(null);
  const [rangeError, setRangeError] = useState('');
  const custom = days === 'custom';
  const [message, setMessage] = useState('');
  const client = useQueryClient();
  const history = useQuery({ queryKey: ['portfolio-history', portfolioId, days, custom ? range : null], queryFn: () => loadPortfolioHistory(portfolioId, custom ? 30 : Number(days), custom && range ? range : undefined), enabled: !custom || range !== null, staleTime: 60000 });
  const save = useMutation({ mutationFn: () => captureValuation(portfolioId), onSuccess: async row => {
    setMessage(`Zapisano ${row.complete ? 'kompletną' : 'niepełną'} wycenę z ${formatRecordedTime(row.asOf)}. Portfel pozostaje bez zmian.`);
    await Promise.all([client.invalidateQueries({ queryKey: ['portfolio-history', portfolioId] }), client.invalidateQueries({ queryKey: ['valuation', portfolioId] })]);
  } });
  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setRangeError('');
    const fields = new FormData(event.currentTarget);
    const fromDay = String(fields.get('from')); const toDay = String(fields.get('to'));
    const from = new Date(`${fromDay}T00:00:00`); const to = new Date(`${toDay}T23:59:59.999`);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || fromDay > toDay || toDay > localNow().slice(0, 10) || from.getTime() > Date.now() || to.getTime() - from.getTime() > 366 * 86400000) { setRangeError('Wybierz poprawny zakres do 366 dni, bez przyszłych dat.'); return; }
    setRange({ from: from.toISOString(), ...(toDay < localNow().slice(0, 10) ? { to: to.toISOString() } : {}) });
  }
  return <section className="panel portfolio-history" aria-labelledby="portfolio-history-title">
    <div className="investment-heading"><div><span className="eyebrow">ZACHOWAJ PUNKT ODNIESIENIA</span><h3 id="portfolio-history-title">Historia wartości portfela</h3></div><Button disabled={save.isPending} onClick={() => { setMessage(''); save.mutate(); }}>{save.isPending ? 'Zapisywanie wyceny…' : 'Zapisz obecną wycenę'}</Button></div>
    {history.data?.items.some(row => row.demo) && <p className="history-demo-notice" role="status">DEMO — widoczne są fikcyjne wyceny do prezentacji różnych okresów. Nie przedstawiają rzeczywistej historii Twojego portfela i nie uzupełniają dni bez rzeczywistych zapisów.</p>}
    <p className="cash-help">Zapisujemy wycenę z chwili naciśnięcia przycisku. Późniejsze zmiany danych nie przeliczają tych zapisów. Samo odświeżenie widoku nie tworzy historii.</p>
    <p role="status" className="cash-success">{message}</p>{save.error && <p role="alert" className="error">{save.error.message} Jeśli połączenie zostało przerwane, odśwież historię przed ponownym zapisem.</p>}
    <div className="history-controls"><FormSelect label="Zakres historii" value={days} onValueChange={value => { setDays(value); setRangeError(''); }} options={[{ value: '7', label: 'Ostatnie 7 dni' }, { value: '30', label: 'Ostatnie 30 dni' }, { value: '90', label: 'Ostatnie 90 dni' }, { value: '365', label: 'Ostatnie 365 dni' }, { value: 'custom', label: 'Własny zakres' }]} /><Button variant="ghost" disabled={history.isFetching || (custom && !range)} onClick={() => void history.refetch()}>Odśwież historię</Button></div>
    {custom && <form className="history-range" onSubmit={applyRange}><label>Od dnia<input name="from" type="date" required max={localNow().slice(0, 10)} aria-describedby="history-range-error" /></label><label>Do dnia<input name="to" type="date" required max={localNow().slice(0, 10)} aria-describedby="history-range-error" /></label><Button type="submit" variant="outline">Pokaż wybrany zakres</Button><p id="history-range-error" role="alert" className="error">{rangeError}</p></form>}
    {custom && !range ? <p role="status">Wybierz daty i zastosuj zakres historii.</p> : history.isPending ? <p role="status">Pobieranie zapisanych wycen…</p> : history.isError ? <p role="alert" className="error">{history.error.message} <Button variant="ghost" onClick={() => void history.refetch()}>Spróbuj ponownie</Button></p> : <>
      <p className="cash-help">Zakres: {formatDate(history.data.from)} – {formatDate(history.data.to)}. {history.data.items.length} {recordWord(history.data.items.length)}. Limit tej wersji: 366 zapisów na portfel.</p>
      {history.data.items.length === 0 ? <p role="status" className="history-empty">Nie masz zapisanych wycen w tym zakresie. Nowe zapisy dotyczą chwili obecnej i nie uzupełnią przeszłych dat.</p> : <ul className="valuation-history-list">{[...history.data.items].reverse().map(row => <li key={row.id}><article aria-label={`Wycena z ${formatRecordedTime(row.asOf)}`}>
        <div className="history-row-heading"><h4>{row.demo && <span className="demo-label">DEMO</span>}{formatRecordedTime(row.asOf)}</h4><span className={row.complete ? 'data-ok' : 'data-issue'}>{row.demo ? row.complete ? 'Kompletne dane demonstracyjne' : 'Niepełne dane demonstracyjne' : row.complete ? 'Kompletna w chwili zapisu' : 'Niepełna w chwili zapisu'}</span></div>
        <dl className="history-values"><div><dt>Wartość portfela</dt><dd>{money(row.valueBase)}</dd></div><div><dt>Wpłaty netto</dt><dd>{money(row.netContributionsBase)}</dd></div><div><dt>Wynik nominalny</dt><dd>{money(row.pnl)}</dd></div><div><dt>Prosta stopa od wpłat netto</dt><dd>{row.pnlPct === null ? '—' : formatPercent(row.pnlPct)}</dd></div></dl>
        {!row.complete && <p className="data-issue">Pełna wartość i wynik niedostępne. Wyceniona część: {money(row.pricedSubtotal)}. Braki cen i kursów są w szczegółach.</p>}
        {row.pnlPctReason === 'NON_POSITIVE_BASE' && <p className="cash-help">Procent niedostępny: wpłaty netto ≤ 0.</p>}
        <SnapshotDisclosure id={row.id} />
      </article></li>)}</ul>}
      <p className="cash-help">To zapisy punktowe, bez interpolacji między nimi. Dopłata może zwiększyć wartość portfela i nie oznacza zysku. Prosta stopa nie uwzględnia czasu wpłat i wypłat.</p>
      <details className="history-gaps"><summary>Dni bez rzeczywistej zapisanej wyceny: {history.data.missingDays.length}</summary><p className="cash-help">Daty według czasu polskiego. Dane DEMO nie są liczone jako rzeczywiste zapisy. Dzień z rzeczywistą niepełną wyceną ma zapis, ale nie ma pełnej wartości. Pomiędzy zapisami nie znamy przebiegu wartości portfela.</p>{history.data.missingDays.length ? <ul>{history.data.missingDays.map(day => <li key={day}>{day.split('-').reverse().join('.')}</li>)}</ul> : <p className="cash-help">W każdym dniu zakresu jest przynajmniej jeden zapis. Nie oznacza to ciągłej historii.</p>}</details>
    </>}
  </section>;
}
function SnapshotDisclosure({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  return <details className="snapshot-details" onToggle={event => setOpen(event.currentTarget.open)}><summary>Szczegóły zapisanej wyceny</summary>{open && <SnapshotDetails id={id} />}</details>;
}
function SnapshotDetails({ id }: { id: string }) {
  const query = useQuery({ queryKey: ['valuation-snapshot', id], queryFn: () => loadValuationSnapshot(id), staleTime: Infinity });
  if (query.isPending) return <p role="status">Pobieranie szczegółów…</p>;
  if (query.isError) return <p role="alert" className="error">{query.error.message} <Button variant="ghost" onClick={() => void query.refetch()}>Spróbuj ponownie</Button></p>;
  const { valuation } = query.data;
  const sourceLabel = query.data.demo ? 'założenie DEMO' : 'wpis ręczny';
  return <div className="snapshot-sources">
    {query.data.demo && <p className="history-demo-notice">DEMO — daty, kwoty, ceny i pozostałe dane tego przykładu są fikcyjne.</p>}
    <p className="cash-help">{query.data.demo ? 'Przykładowy stan na' : 'Stan na'} {formatDate(valuation.asOf)} · silnik {valuation.engineVersion} · progi cen/FX: {valuation.quoteMaxAgeHours}h/{valuation.fxMaxAgeHours}h. {query.data.demo ? 'To przykładowe założenia demonstracyjne.' : 'To dane zachowane w chwili zapisu.'}</p>
    {valuation.positions.length === 0 && <p className="cash-help">Brak otwartych pozycji w chwili zapisu.</p>}
    <ul>{valuation.positions.map(row => <li key={row.instrumentId}><h5>{row.symbol} · {row.name}</h5><p>Wartość: {money(row.valueBase)} · koszt historyczny: {money(row.remainingCostBase)}</p><p>Cena: {row.quote ? `${formatMoney(row.quote.price)} ${row.currency} · ${formatDate(row.quote.asOf)} · ${query.data.demo ? sourceLabel : quoteSourceLabel(row.quote.source)}` : 'brak'}</p><p>FX: {row.fx ? `${row.fx.rate} PLN/${row.currency}${row.fx.asOf ? ` · ${formatDate(row.fx.asOf)} · ${sourceLabel}` : ' · kurs tożsamościowy'}` : 'brak'}</p>{row.issues.length > 0 && <p className="data-issue">{row.issues.map(issue => issueNames[issue]).join(', ')}</p>}</li>)}</ul>
    <h5>{query.data.demo ? 'Gotówka w przykładzie' : 'Gotówka w chwili zapisu'}</h5><ul>{valuation.cash.map(row => <li key={row.currency}><p>{formatMoney(row.amount)} {row.currency} · wartość {money(row.valueBase)}</p><p>FX: {row.fx ? `${row.fx.rate} PLN/${row.currency}${row.fx.asOf ? ` · ${formatDate(row.fx.asOf)} · ${sourceLabel}` : ' · kurs tożsamościowy'}` : row.amount === '0' ? 'niewymagany przy zerowym saldzie' : 'brak'}</p>{row.issues.length > 0 && <p className="data-issue">{row.issues.map(issue => issueNames[issue]).join(', ')}</p>}</li>)}</ul>
    <p className="cash-help">Zapisano {formatDate(query.data.createdAt)}. Kwoty wyświetlamy do 2 miejsc; zapis zachowuje precyzję wyceny.</p>
  </div>;
}
