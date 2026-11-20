import { quoteSourceLabel } from '../lib/format';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FlaskConical, ArrowRight } from 'lucide-react';
import { simulationInputSchema } from '@investorkit/shared';
import type { Simulation } from '@investorkit/shared';
import { Button } from '../components/ui/button';
import { FormSelect } from '../components/ui/form-select';
import { listInstruments, loadMarketStates, loadQuotes, loadValuation, simulatePurchase } from '../lib/api';
import { formatAmount, formatAverageCosts, formatCash, formatDate, formatMoney, formatPercent, formatQuantity, trimDecimal } from '../lib/format';
const money = (value: string | null | undefined) => value == null ? '—' : formatMoney(value);
const signedMoney = (value: string | null) => value === null ? '—' : `${value !== '0' && !value.startsWith('-') ? '+' : ''}${formatMoney(value)}`;
const issues = { MISSING_QUOTE: 'brak ceny', STALE_QUOTE: 'nieaktualna cena', FUTURE_QUOTE: 'cena z przyszłości', MISSING_FX: 'brak kursu FX', STALE_FX: 'nieaktualny kurs FX', FUTURE_FX: 'kurs FX z przyszłości' };
export function PurchaseSimulator({ portfolioId }: { portfolioId: string }) {
  const instruments = useQuery({ queryKey: ['instruments'], queryFn: listInstruments });
  const valuation = useQuery({ queryKey: ['valuation', portfolioId], queryFn: () => loadValuation(portfolioId), refetchInterval: 60000 });
  const [selected, setSelected] = useState('');
  const [funding, setFunding] = useState('NEW_MONEY');
  // An explicit user draft (including an empty string) always wins over refreshed prices.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState('');
  const simulation = useMutation({ mutationFn: (input: Parameters<typeof simulatePurchase>[1]) => simulatePurchase(portfolioId, input) });
  const instrument = instruments.data?.find(item => item.id === selected) ?? instruments.data?.[0];
  const quotes = useQuery({ queryKey: ['quotes', instrument?.id], queryFn: () => loadQuotes(instrument!.id), enabled: !!instrument, refetchInterval: 60000 });
  const market = useQuery({ queryKey: ['market'], queryFn: loadMarketStates, retry: false, refetchInterval: 60000 });
  const binding = market.data?.items.find(row => row.instrumentId === instrument?.id);
  const now = Date.now();
  // Records arrive in sequence order, the same tie-break as the engine. Future rows never prefill.
  const manualReference = quotes.data?.filter(item => item.currency === instrument?.currency && Date.parse(item.asOf) <= now)
    .reduce<(NonNullable<typeof quotes.data>)[number] | undefined>((latest, item) => !latest || Date.parse(item.asOf) >= Date.parse(latest.asOf) ? item : latest, undefined);
  const reference = !market.data ? undefined : binding?.mode === 'marketstack' ? binding.quote ? { ...binding.quote, currency: binding.currency, source: 'marketstack' as const } : undefined : manualReference;
  const sourceFingerprint = JSON.stringify([binding?.mode, reference?.price, reference?.asOf]);
  useEffect(() => { simulation.reset(); }, [sourceFingerprint]);
  const fresh = reference && now - Date.parse(reference.asOf) <= (valuation.data?.quoteMaxAgeHours ?? 72) * 3600000;
  const price = instrument ? priceDrafts[instrument.id] ?? (fresh ? trimDecimal(reference.price).replace('.', ',') : '') : '';
  const result = simulation.data && simulation.variables?.unitPrice === price.trim().replace(',', '.') ? simulation.data : undefined;
  function clear() { simulation.reset(); setValidation(''); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); clear();
    const fields = new FormData(event.currentTarget);
    const decimal = (name: string) => String(fields.get(name) ?? '').trim().replace(',', '.');
    const parsed = simulationInputSchema.safeParse({ instrumentId: instrument?.id, funding, budget: decimal('budget'), unitPrice: decimal('unitPrice'), commission: decimal('commission') });
    if (!parsed.success) { setValidation('Sprawdź instrument, budżet, cenę i prowizję.'); return; }
    simulation.mutate(parsed.data);
  }
  return <section id="simulator" className="investments" aria-labelledby="simulator-title">
    <div className="investment-heading"><div><span className="eyebrow">SPRAWDŹ PRZED ZAKUPEM</span><h2 id="simulator-title"><FlaskConical size={22} />Symulator zakupu</h2></div></div>
    <p className="cash-help">Symulacja nie zapisuje transakcji i nie zmienia portfela.</p>
    <div className="simulation-layout"><section className="panel investment-editor"><h3>Planowany zakup</h3>
      {instruments.isPending ? <p role="status">Pobieranie instrumentów…</p> : instruments.isError ? <p className="error" role="alert">{instruments.error.message} <button onClick={() => void instruments.refetch()}>Spróbuj ponownie</button></p> : !instrument ? <p className="cash-help">Dodaj instrument w sekcji Inwestycje, aby sprawdzić zakup.</p> : <form onSubmit={submit} onChange={clear} aria-busy={simulation.isPending}><fieldset disabled={simulation.isPending}>
        <FormSelect label="Instrument" value={instrument.id} onValueChange={value => { setSelected(value); clear(); }} options={instruments.data.map(item => ({ value: item.id, label: `${item.symbol} · ${item.name} · ${item.currency}` }))} />
        <label>Budżet z prowizją ({instrument.currency})<input name="budget" inputMode="decimal" required maxLength={29} placeholder="np. 1000" /></label>
        <div className="cash-fields"><label>Cena zakupu ({instrument.currency})<input name="unitPrice" inputMode="decimal" required maxLength={29} value={price} onChange={event => setPriceDrafts(current => ({ ...current, [instrument.id]: event.target.value }))} aria-describedby="simulation-price-source" /></label><label>Prowizja ({instrument.currency})<input name="commission" inputMode="decimal" required maxLength={29} defaultValue="0" /></label></div>
        <p id="simulation-price-source" className="cash-help" role="status">{quotes.isPending || market.isPending ? 'Pobieranie ceny referencyjnej…' : quotes.isError || market.isError ? <>Nie udało się pobrać ceny. Wpisz cenę zakupu samodzielnie. <button type="button" onClick={() => void Promise.all([quotes.refetch(), market.refetch()])}>Ponów pobieranie</button></> : reference ? <>Cena referencyjna: {money(reference.price)} {instrument.currency} · {formatDate(reference.asOf)} · {quoteSourceLabel(reference.source)}.{!fresh && ' Cena jest nieaktualna — nie uzupełniamy nią formularza. Wpisz cenę zakupu i uzupełnij wycenę w Inwestycjach.'}{fresh && trimDecimal(reference.price) === '0' && ' Cena wynosi zero. Cena zakupu musi być większa od zera.'}</> : quotes.data?.length ? 'Dostępne ceny pochodzą z przyszłości i nie mogą służyć wycenie. Wpisz cenę zakupu i uzupełnij aktualne notowanie.' : 'Brak ceny referencyjnej. Wpisz cenę zakupu. Nowa pozycja bez notowań użyje jej jako założenia wyceny.'}</p>
        <FormSelect label="Źródło środków" value={funding} onValueChange={value => { setFunding(value); clear(); }} options={[{ value: 'NEW_MONEY', label: 'Nowe środki' }, { value: 'EXISTING_CASH', label: 'Istniejąca gotówka' }]} />
        <p className="cash-help">{funding === 'NEW_MONEY' ? 'Budżet zostanie dodany do portfela na potrzeby symulacji.' : `Zakup z gotówki w ${instrument.currency}, bez wymiany walut.`}</p>
        <Button type="submit" disabled={simulation.isPending}>{simulation.isPending ? 'Obliczanie…' : 'Oblicz symulację'}<ArrowRight size={17} /></Button>
      </fieldset></form>}
      {(validation || simulation.error) && <p role="alert" className="error">{validation || simulation.error?.message}</p>}
    </section><section className="panel simulation-result" aria-label="Wynik symulacji" aria-live="polite">
      {simulation.isPending ? <p role="status">Obliczanie symulacji…</p> : result ? <SimulationResult data={result} /> : <div className="simulation-empty"><FlaskConical size={30} /><h3>Jak zmieni się Twoja pozycja?</h3><p>Uzupełnij zakup, aby zobaczyć ilość, średni koszt, udział i pozostałą gotówkę.</p></div>}
    </section></div>
  </section>;
}
function SimulationResult({ data }: { data: Simulation }) {
  const { assumptions: a, before, after, impact } = data;
  const previous = before.positions.find(item => item.instrumentId === a.instrumentId);
  const position = after.positions.find(item => item.instrumentId === a.instrumentId)!;
  const average = formatAverageCosts(previous?.averageCostLocal ?? null, position.averageCostLocal);
  const beforeWeight = previous ? previous.weightPct : before.complete && before.totalValue !== '0' ? '0' : null;
  const percent = (value: string | null) => value === null ? '—' : formatPercent(value);
  const rows = [
    ['Wartość całego portfela (PLN)', money(before.totalValue), money(after.totalValue)],
    ['Ilość instrumentu (szt.)', formatAmount(previous?.quantity ?? '0'), formatAmount(position.quantity)],
    [`Średni koszt z prowizją (${a.currency}/szt.)`, average.before, average.after],
    ['Wartość pozycji (PLN)', money(previous ? previous.valueBase : '0'), money(position.valueBase)],
    ['Udział pozycji z gotówką', percent(beforeWeight), percent(position.weightPct)],
    [`Gotówka na subkoncie (${a.currency})`, money(before.cash.find(item => item.currency === a.currency)?.amount), money(data.remainingCash)],
    ['Wpłaty netto (PLN)', money(before.netContributionsBase), money(after.netContributionsBase)],
    ['Wynik całego portfela (PLN)', money(before.pnl), money(after.pnl)],
  ];
  const missing = [...after.positions.filter(item => item.issues.length).map(item => `${item.symbol}: ${item.issues.map(issue => issues[issue]).join(', ')}`), ...after.cash.filter(item => item.issues.length).map(item => `${item.currency}: ${item.issues.map(issue => issues[issue]).join(', ')}`)];
  return <><div className="simulation-result-heading"><h3>Po zakupie · {position.symbol}</h3>{!previous && <span className="pill">Nowa pozycja</span>}</div>
    <dl className="simulation-metrics" aria-label="Podsumowanie zakupu">
      <div><dt>Kupowana ilość</dt><dd title={`${data.quantity} szt.`}>{formatQuantity(data.quantity)} <small>szt.</small></dd></div>
      <div><dt>Średni koszt z prowizją</dt><dd>{average.before} <span aria-label="zmienia się na">→</span> {average.after}<small>{a.currency}/szt.</small></dd></div>
      <div><dt>Udział w portfelu</dt><dd>{percent(beforeWeight)} <span aria-label="zmienia się na">→</span> {percent(position.weightPct)}<small>Z uwzględnieniem gotówki</small></dd></div>
      <div><dt>Pozostała gotówka</dt><dd>{formatCash(data.remainingCash, a.currency)}<small>Na subkoncie po zakupie</small></dd></div>
    </dl>
    <p className="simulation-portfolio-value">Wartość całego portfela po symulacji <strong>{money(after.totalValue)} PLN</strong></p>
    {missing.length > 0 && <div className="simulation-warning" role="status"><strong>Wycena niepełna</strong><p>{missing.join(' · ')}. Wartość portfela i udziały wymagają aktualnych cen oraz kursów. Uzupełnij dane w Inwestycjach.</p></div>}
    {a.reference?.source === 'scenario' && <p className="simulation-warning" role="status">Brak notowania: wycena nowej pozycji zakłada cenę zakupu.</p>}
    {a.reference && trimDecimal(a.unitPrice) !== trimDecimal(a.reference.price) && <p className="simulation-price-notice" role="status">Kupujesz po {money(a.unitPrice)} {a.currency}. Cena referencyjna wynosi {money(a.reference.price)} {a.currency}{impact.netEffectBase === null ? ', ale nie jest aktualna — wynik dokupowanej części jest niedostępny.' : `, dlatego wynik dokupowanej części według tej wyceny to ${money(impact.netEffectBase)} PLN, z prowizją. To nie jest prognoza.`}</p>}
    <details className="simulation-details"><summary>Szczegóły obliczeń</summary>
      <p className="cash-help">Stan na {formatDate(after.asOf)} · {a.funding === 'NEW_MONEY' ? 'nowe środki' : 'istniejąca gotówka'}. Ponów obliczenie po zmianie danych portfela.</p>
      <table className="simulation-comparison"><caption>Porównanie przed i po</caption><thead><tr><th scope="col">Miara</th><th scope="col">Przed</th><th scope="col">Po</th></tr></thead><tbody>{rows.map(([label, left, right]) => <tr key={label}><th scope="row">{label}</th><td>{left}</td><td>{right}</td></tr>)}</tbody></table>
      <dl className="simulation-breakdown" aria-label="Rozliczenie zmiany wartości">
        <div><dt>Dopłata nowych środków</dt><dd>{signedMoney(impact.newMoneyBase)} PLN</dd></div>
        <div><dt>Różnica ceny wyceny i zakupu</dt><dd>{signedMoney(impact.priceDifferenceBase)} PLN</dd></div>
        <div><dt>Koszt prowizji</dt><dd>{impact.commissionBase === '0' ? '0,00' : `−${money(impact.commissionBase)}`} PLN</dd></div>
        <div><dt>Zmiana wartości z dopłatą</dt><dd>{signedMoney(data.delta.totalValue)} PLN</dd></div>
      </dl>
      <p>Wynik niezrealizowany dokupowanej części: <strong>{signedMoney(impact.netEffectBase)} PLN</strong> · {impact.netEffectPct === null ? '—' : formatPercent(impact.netEffectPct)} względem kosztu z prowizją. Dopłata nie jest zyskiem.</p>
      <p>Koszt zakupu z prowizją: {money(data.actualCost)} {a.currency}. Reszta budżetu: {formatCash(data.budgetRemaining, a.currency)}.</p>
      <p>Cena zakupu: {money(a.unitPrice)} {a.currency}. Cena referencyjna: {a.reference ? `${money(a.reference.price)} ${a.currency} · ${quoteSourceLabel(a.reference.source)} · ${formatDate(a.reference.asOf)}` : 'brak'}.</p>
      <p>FX: {formatAmount(a.fx.rate)} PLN za 1 {a.currency} · {a.fx.asOf ? `wpis ręczny z ${formatDate(a.fx.asOf)}` : 'kurs tożsamościowy PLN = 1'}.</p>
      <p className="cash-help">Ceny i FX: maksymalnie {after.quoteMaxAgeHours}h/{after.fxMaxAgeHours}h. Stare i przyszłe dane nie służą wycenie. Ilość zakupu zaokrąglamy w dół do {a.quantityScale} miejsc. Kwoty w widoku mają 2 miejsca (HALF_EVEN); średni koszt pokazuje więcej, gdy to potrzebne do odróżnienia wartości. „≈” oznacza ilość przybliżoną do 6 miejsc. Silnik i API zachowują pełną precyzję obliczeń. Koszt średni służy analizie, nie rozliczeniu podatkowemu.</p>
    </details>
  </>;
}
