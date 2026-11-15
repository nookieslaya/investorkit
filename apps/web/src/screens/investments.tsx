import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChartNoAxesCombined, Plus, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { createInstrumentSchema, ledgerTradeSchema, quoteInputSchema, fxInputSchema, instrumentSchema } from '@investorkit/shared';
import { FormSelect } from '../components/ui/form-select';
import { Button } from '../components/ui/button';
import { listInstruments, addInstrument, addTrade, addQuote, addFx, loadValuation, loadOperations } from '../lib/api';
import { formatAmount, formatRounded, formatPercent, localNow, formatDate } from '../lib/format';
type Mode = 'instrument' | 'trade' | 'quote' | 'fx';
const messages = { MISSING_QUOTE: 'Brak ceny', STALE_QUOTE: 'Cena starsza niż próg', FUTURE_QUOTE: 'Cena dopiero z przyszłości', MISSING_FX: 'Brak kursu wyceny', STALE_FX: 'Kurs starszy niż próg', FUTURE_FX: 'Kurs dopiero z przyszłości' };
function text(fields: FormData, key: string) { return String(fields.get(key) ?? '').trim(); }
function decimal(fields: FormData, key: string) { return text(fields, key).replace(',', '.'); }
function date(fields: FormData, key: string) {
  const value = new Date(text(fields, key));
  if (!Number.isFinite(value.getTime())) throw new Error('Podaj poprawną datę i godzinę.');
  return value.toISOString();
}
export function InvestmentsOverview({ portfolioId }: { portfolioId: string }) {
  const client = useQueryClient();
  const instruments = useQuery({ queryKey: ['instruments'], queryFn: listInstruments });
  const valuation = useQuery({ queryKey: ['valuation', portfolioId], queryFn: () => loadValuation(portfolioId), refetchInterval: 60000 });
  const history = useQuery({ queryKey: ['operations', portfolioId], queryFn: () => loadOperations(portfolioId) });
  const [mode, setMode] = useState<Mode>('trade'); const [selected, setSelected] = useState('');
  const [tradeKind, setTradeKind] = useState<'BUY' | 'SELL'>('BUY'); const [fxCurrency, setFxCurrency] = useState<'EUR' | 'USD'>('USD');
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const pending = useRef<{ body: string; key: string } | null>(null);
  const instrument = instruments.data?.find(row => row.id === selected) ?? instruments.data?.[0];
  const data = valuation.data;
  const mutation = useMutation({
    mutationFn: (job: { kind: Mode; run: () => Promise<unknown> }) => job.run(),
    onSuccess: async (result, job) => {
      const invalidations = [client.invalidateQueries({ queryKey: ['valuation', portfolioId] })];
      if (job.kind === 'instrument') {
        const created = instrumentSchema.parse(result); setSelected(created.id);
        invalidations.push(client.invalidateQueries({ queryKey: ['instruments'] }));
      }
      if (job.kind === 'trade') {
        pending.current = null;
        invalidations.push(client.invalidateQueries({ queryKey: ['operations', portfolioId] }), client.invalidateQueries({ queryKey: ['cash', portfolioId] }));
      }
      setSuccess({ instrument: 'Instrument dodany. Możesz zapisać zakup.', trade: 'Transakcja zapisana. Salda i wycena zostały przeliczone.', quote: 'Cena zapisana. Wycena została przeliczona.', fx: 'Kurs wyceny zapisany. Historyczne kursy operacji pozostają bez zmian.' }[job.kind]);
      await Promise.all(invalidations);
    },
  });
  function switchMode(next: Mode) { setMode(next); setError(''); setSuccess(''); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    const form = event.currentTarget; const fields = new FormData(form);
    try {
      if (mode === 'instrument') {
        const input = createInstrumentSchema.safeParse({ name: text(fields, 'name'), symbol: text(fields, 'symbol').toUpperCase(), mic: text(fields, 'mic').toUpperCase(), type: text(fields, 'type'), currency: text(fields, 'currency'), quantityScale: Number(text(fields, 'quantityScale')), isin: text(fields, 'isin').toUpperCase() || null, issuerCountry: text(fields, 'issuerCountry').toUpperCase() || null });
        if (!input.success) throw new Error('Sprawdź nazwę, symbol, kod MIC (4 znaki), walutę i precyzję ilości (0–10). ISIN i kraj są opcjonalne.');
        await mutation.mutateAsync({ kind: mode, run: () => addInstrument(input.data) });
      } else if (mode === 'fx') {
        const input = fxInputSchema.safeParse({ currency: fxCurrency, baseCurrency: 'PLN', rate: decimal(fields, 'rate'), asOf: date(fields, 'asOf'), source: 'manual' });
        if (!input.success) throw new Error('Sprawdź dodatni kurs (do 12 miejsc po przecinku) i datę.');
        await mutation.mutateAsync({ kind: mode, run: () => addFx(input.data) });
      } else {
        if (!instrument) throw new Error('Najpierw dodaj instrument.');
        if (mode === 'quote') {
          const input = quoteInputSchema.safeParse({ currency: instrument.currency, price: decimal(fields, 'price'), asOf: date(fields, 'asOf'), source: 'manual' });
          if (!input.success) throw new Error('Sprawdź cenę (zero lub więcej, do 10 miejsc po przecinku) i datę.');
          await mutation.mutateAsync({ kind: mode, run: () => addQuote(instrument.id, input.data) });
        } else {
          const occurredAt = date(fields, 'occurredAt');
          const input = ledgerTradeSchema.safeParse({ kind: tradeKind, instrumentId: instrument.id, currency: instrument.currency, commissionCurrency: instrument.currency, quantity: decimal(fields, 'quantity'), unitPrice: decimal(fields, 'unitPrice'), commission: decimal(fields, 'commission'), occurredAt,
            fxToBase: instrument.currency === 'PLN' ? '1' : decimal(fields, 'historicalFx'), fxAsOf: instrument.currency === 'PLN' ? occurredAt : date(fields, 'fxAsOf'), fxSource: 'manual', note: text(fields, 'note') });
          if (!input.success) throw new Error('Sprawdź ilość, cenę, prowizję, historyczny kurs i daty. Kwoty/ilości: do 10 miejsc po przecinku; FX: do 12.');
          const body = JSON.stringify(input.data);
          if (pending.current?.body !== body) pending.current = { body, key: crypto.randomUUID() };
          const key = pending.current.key;
          await mutation.mutateAsync({ kind: mode, run: () => addTrade(portfolioId, input.data, key) });
        }
      }
      if (mode === 'instrument') form.reset();
      else for (const element of Array.from(form.elements)) if (element instanceof HTMLInputElement && !['asOf', 'occurredAt', 'fxAsOf'].includes(element.name)) element.value = element.defaultValue;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Nie udało się zapisać danych.'); }
  }
  const trades = history.data?.items.filter(item => 'instrumentId' in item) ?? [];
  return <section id="investments" className="investments">
    <div className="investment-heading"><div><span className="eyebrow">WARTOŚĆ Z JASNYMI ZAŁOŻENIAMI</span><h2><ChartNoAxesCombined size={22} />Inwestycje i wynik portfela</h2></div><Button variant="ghost" disabled={valuation.isFetching} onClick={() => void valuation.refetch()}><RefreshCw size={16} />Odśwież wycenę</Button></div>
    {valuation.isPending ? <p role="status">Obliczanie wyceny…</p> : valuation.isError ? <p role="alert" className="error">{valuation.error.message} <button onClick={() => void valuation.refetch()}>Spróbuj ponownie</button></p> : data && <>
      <div className="metrics investment-metrics" aria-label="Wycena i wynik"><article className="panel metric cash-metric"><span>Wartość portfela</span><strong>{data.totalValue === null ? '—' : formatAmount(data.totalValue)}</strong><small>PLN · pozycje i gotówka</small></article><article className="panel metric cash-metric"><span>Wynik portfela</span><strong className={data.pnl === null ? '' : data.pnl.startsWith('-') ? 'negative-result' : 'positive-result'}>{data.pnl === null ? '—' : formatAmount(data.pnl)}</strong><small>PLN · obejmuje prowizje i zmianę kursów, także gotówki</small></article><article className="panel metric cash-metric"><span>Prosta stopa od wpłat netto</span><strong>{data.pnlPct === null ? '—' : formatPercent(data.pnlPct)}</strong><small>{data.pnlPctReason === 'NON_POSITIVE_BASE' ? 'Procent niedostępny: wpłaty netto ≤ 0' : 'Bez uwzględnienia czasu wpłat i wypłat'}</small></article></div>
      <div className={`valuation-status ${data.complete ? 'complete' : 'incomplete'}`} role="status"><strong>{data.complete ? 'Wycena kompletna' : 'Wycena niepełna'}</strong><span>Na {formatDate(data.asOf)} · maksymalny wiek cen/kursów: {data.quoteMaxAgeHours}h/{data.fxMaxAgeHours}h</span>{!data.complete && <p>Wyceniona część: {formatAmount(data.pricedSubtotal)} PLN. Pełna wartość i wynik pojawią się po uzupełnieniu aktualnych danych.</p>}{data.cash.filter(row => row.issues.length > 0).map(row => <p key={row.currency}>{row.currency}: {row.issues.map(issue => messages[issue]).join(', ')}</p>)}{data.valuationRange && <small>Daty wykorzystanych danych: {formatDate(data.valuationRange.from)} – {formatDate(data.valuationRange.to)}</small>}</div>
      <section className="panel holdings"><div className="cash-section-heading"><h3>Twoje pozycje</h3><span className="pill">ŚREDNI KOSZT ANALITYCZNY</span></div>{data.positions.length === 0 ? <p className="cash-help">Nie masz jeszcze otwartych pozycji. Dodaj instrument i zakup opłacony z gotówki w jego walucie.</p> : <div className="holdings-scroll" tabIndex={0} role="region" aria-label="Tabela pozycji, przewijana poziomo"><table><thead><tr><th>Instrument / ilość</th><th>Koszt historyczny PLN</th><th>Cena i kurs wyceny</th><th>Wartość PLN</th><th>Niezrealizowany wynik PLN</th><th>Udział</th><th>Dane</th></tr></thead><tbody>{data.positions.map(position => <tr key={position.instrumentId}>
        <td><strong>{position.symbol}</strong><small>{position.name}</small><small>{formatAmount(position.quantity)} szt. · {position.currency}</small><small>Średni koszt: {position.averageCostLocal === null ? '—' : formatRounded(position.averageCostLocal, 10)} {position.currency}/szt.</small></td><td>{formatAmount(position.remainingCostBase)}</td>
        <td>{position.quote ? <><strong>{formatAmount(position.quote.price)} {position.currency}</strong><small>{formatDate(position.quote.asOf)} · ręcznie</small></> : '—'}{position.fx && <small>FX {formatAmount(position.fx.rate)} PLN/{position.currency}{position.fx.asOf ? ` · ${formatDate(position.fx.asOf)}` : ' · kurs tożsamościowy'}</small>}</td>
        <td>{position.valueBase === null ? '—' : formatAmount(position.valueBase)}</td><td>{position.unrealizedBase === null ? '—' : formatAmount(position.unrealizedBase)}<small>{position.unrealizedPct === null ? '—' : formatPercent(position.unrealizedPct)}</small></td><td>{position.weightPct === null ? '—' : formatPercent(position.weightPct)}</td><td>{position.issues.length ? position.issues.map(issue => <span className="data-issue" key={issue}>{messages[issue]}</span>) : <span className="data-ok">Aktualne</span>}</td>
      </tr>)}</tbody></table></div>}<div className="position-cards" aria-label="Pozycje na telefonie">{data.positions.map(position => <article key={position.instrumentId} className="position-card"><h4>{position.symbol}</h4><p>{position.name}</p><p>{formatAmount(position.quantity)} szt. · {position.currency}</p><dl><dt>Koszt historyczny PLN</dt><dd>{formatAmount(position.remainingCostBase)}</dd><dt>Wartość PLN</dt><dd>{position.valueBase === null ? '—' : formatAmount(position.valueBase)}</dd><dt>Niezrealizowany wynik PLN</dt><dd>{position.unrealizedBase === null ? '—' : formatAmount(position.unrealizedBase)}<small>{position.unrealizedPct === null ? '—' : formatPercent(position.unrealizedPct)}</small></dd><dt>Udział z gotówką</dt><dd>{position.weightPct === null ? '—' : formatPercent(position.weightPct)}</dd><dt>Średni koszt lokalny</dt><dd>{position.averageCostLocal === null ? '—' : formatRounded(position.averageCostLocal, 10)} {position.currency}</dd></dl>{position.quote && <p>Cena: {formatAmount(position.quote.price)} {position.currency}<small>{formatDate(position.quote.asOf)} · wpis ręczny</small></p>}{position.fx && <p>FX: {formatAmount(position.fx.rate)} PLN/{position.currency}<small>{position.fx.asOf ? `${formatDate(position.fx.asOf)} · wpis ręczny` : 'PLN = 1'}</small></p>}<p className={position.issues.length ? 'data-issue' : 'data-ok'}>{position.issues.length ? `Stan danych: ${position.issues.map(issue => messages[issue]).join(', ')}` : 'Dane aktualne'}</p></article>)}</div><p className="cash-help">Koszt średni służy analizie. Nie jest rozliczeniem podatkowym. Udziały obejmują gotówkę i są dostępne przy kompletnej wycenie.</p></section>
    </>}
    <div className="investment-grid"><section className="panel investment-editor" aria-labelledby="investment-editor-title"><h3 id="investment-editor-title">Uzupełnij swój portfel</h3><div className="editor-modes" role="group" aria-label="Wybierz formularz">{([['instrument', 'Instrument'], ['trade', 'Kupno / sprzedaż'], ['quote', 'Cena ręczna'], ['fx', 'Kurs wyceny']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={mode === key} disabled={mutation.isPending} onClick={() => switchMode(key)}>{label}</button>)}</div>
      {instruments.isPending && <p role="status">Pobieranie instrumentów…</p>}{instruments.isError && <p className="error" role="alert">{instruments.error.message} <button onClick={() => void instruments.refetch()}>Ponów pobieranie</button></p>}
      <form key={mode === 'trade' || mode === 'quote' ? `${mode}-${instrument?.id ?? ''}` : mode} onSubmit={event => void submit(event)}><fieldset disabled={mutation.isPending}>
        {mode === 'instrument' ? <><label>Nazwa instrumentu<input name="name" required maxLength={120} placeholder="Pełna nazwa akcji lub ETF" /></label><div className="cash-fields"><label>Symbol (ticker)<input name="symbol" required maxLength={24} placeholder="np. ABC" /></label><label>Rynek (MIC)<input name="mic" required minLength={4} maxLength={4} placeholder="np. XWAR" /></label></div><div className="cash-fields"><FormSelect label="Typ instrumentu" name="type" defaultValue="STOCK" options={[{ value: 'STOCK', label: 'Akcja' }, { value: 'ETF', label: 'ETF' }]} /><FormSelect label="Waluta instrumentu" name="currency" defaultValue="PLN" options={['PLN', 'EUR', 'USD'].map(value => ({ value, label: value }))} /></div><label>Precyzja ilości (0–10 miejsc)<input type="number" name="quantityScale" min={0} max={10} step={1} defaultValue="0" required /></label><div className="cash-fields"><label>ISIN (opcjonalnie)<input name="isin" maxLength={12} /></label><label>Kraj emitenta (opcjonalnie)<input name="issuerCountry" maxLength={2} placeholder="np. PL" /></label></div></> : mode === 'fx' ? <><FormSelect label="Waluta kursu wyceny" value={fxCurrency} onValueChange={value => setFxCurrency(value as 'EUR' | 'USD')} options={['USD', 'EUR'].map(value => ({ value, label: value }))} /><label>Kurs wyceny (PLN za 1 {fxCurrency})<input name="rate" inputMode="decimal" required maxLength={29} placeholder="np. 4,20" /></label><label>Data i godzina kursu wyceny<input type="datetime-local" name="asOf" defaultValue={localNow()} required /></label><p className="cash-help">Kurs służy bieżącej wycenie. Nie wymienia gotówki i nie zmienia historycznych kursów transakcji. Źródło: wpis ręczny.</p></> : <>
          <FormSelect label="Instrument" value={instrument?.id ?? ''} onValueChange={setSelected} required placeholder="Wybierz instrument" options={instruments.data?.map(item => ({ value: item.id, label: `${item.symbol} · ${item.name} · ${item.currency}` })) ?? []} />
          {!instrument ? <p className="cash-help">Najpierw dodaj instrument, wybierając formularz „Instrument”.</p> : mode === 'quote' ? <><label>Cena wyceny za sztukę ({instrument.currency})<input name="price" inputMode="decimal" required maxLength={29} /></label><label>Data i godzina ceny<input type="datetime-local" name="asOf" defaultValue={localNow()} required /></label><p className="cash-help">Źródło: wpis ręczny. Cena może wynosić zero. Dane starsze niż 72h zostaną oznaczone jako nieaktualne; przyszłe daty są odrzucane.</p></> : <><FormSelect label="Rodzaj transakcji" value={tradeKind} onValueChange={value => setTradeKind(value as 'BUY' | 'SELL')} options={[{ value: 'BUY', label: 'Zakup' }, { value: 'SELL', label: 'Sprzedaż' }]} /><div className="cash-fields"><label>Ilość (do {instrument.quantityScale} miejsc)<input name="quantity" inputMode="decimal" required maxLength={29} /></label><label>Cena transakcji ({instrument.currency})<input name="unitPrice" inputMode="decimal" required maxLength={29} /></label></div><label>Prowizja ({instrument.currency})<input name="commission" inputMode="decimal" defaultValue="0" required maxLength={29} /></label><label>Data i godzina transakcji<input type="datetime-local" name="occurredAt" defaultValue={localNow()} required /></label>{instrument.currency !== 'PLN' && <><label>Historyczny FX transakcji (PLN za 1 {instrument.currency})<input name="historicalFx" inputMode="decimal" required maxLength={29} /></label><label>Data i godzina historycznego FX<input type="datetime-local" name="fxAsOf" defaultValue={localNow()} required /></label></>}<label>Opis transakcji (opcjonalnie)<input name="note" maxLength={300} /></label><p className="cash-help">Zakup wymaga środków w {instrument.currency}, razem z prowizją. Sprzedaż nie może przekroczyć posiadanej ilości. Cena transakcji nie zastępuje ręcznej ceny wyceny.</p></>}
        </>}
        <p role="alert" className="error">{error}</p><p role="status" className="cash-success">{success}</p><Button type="submit" disabled={mutation.isPending || ((mode === 'trade' || mode === 'quote') && !instrument)}>{mode === 'instrument' ? <Plus size={17} /> : <ArrowLeftRight size={17} />}{mutation.isPending ? 'Zapisywanie…' : { instrument: 'Dodaj instrument', trade: tradeKind === 'BUY' ? 'Zapisz zakup' : 'Zapisz sprzedaż', quote: 'Zapisz cenę', fx: 'Zapisz kurs wyceny' }[mode]}</Button>
      </fieldset></form>
    </section><section className="panel investment-history"><h3>Historia transakcji</h3>{history.isPending ? <p role="status">Pobieranie transakcji…</p> : history.isError ? <p role="alert" className="error">{history.error.message} <button onClick={() => void history.refetch()}>Ponów pobieranie</button></p> : trades.length === 0 ? <p className="cash-help">Zapisane zakupy i sprzedaże pojawią się tutaj. Wpłaty i wypłaty znajdziesz w historii gotówki poniżej.</p> : <ul className="cash-list">{trades.map(item => <li key={item.id}><div><strong>{item.kind === 'BUY' ? 'Zakup' : 'Sprzedaż'} · {instruments.data?.find(row => row.id === item.instrumentId)?.symbol ?? 'Instrument'}</strong><small>{formatDate(item.occurredAt)}</small><p>{formatAmount(item.quantity)} szt. × {formatAmount(item.unitPrice)} {item.currency}</p><small>Prowizja: {formatAmount(item.commission)} {item.commissionCurrency}</small><small>Historyczny FX: {formatAmount(item.fxToBase)} PLN/{item.currency} · {formatDate(item.fxAsOf)} · wpis ręczny</small>{item.note && <p>{item.note}</p>}</div></li>)}</ul>}</section></div>
  </section>;
}
