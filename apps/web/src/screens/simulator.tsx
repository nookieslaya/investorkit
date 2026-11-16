import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FlaskConical, ArrowRight } from 'lucide-react';
import { simulationInputSchema } from '@investorkit/shared';
import type { Simulation } from '@investorkit/shared';
import { Button } from '../components/ui/button';
import { FormSelect } from '../components/ui/form-select';
import { listInstruments, simulatePurchase } from '../lib/api';
import { formatAmount, formatRounded, formatPercent, formatDate } from '../lib/format';
const money = (value: string | null | undefined) => value == null ? '—' : formatAmount(value);
export function PurchaseSimulator({ portfolioId }: { portfolioId: string }) {
  const instruments = useQuery({ queryKey: ['instruments'], queryFn: listInstruments });
  const [selected, setSelected] = useState('');
  const [funding, setFunding] = useState('NEW_MONEY');
  const [validation, setValidation] = useState('');
  const simulation = useMutation({ mutationFn: (input: Parameters<typeof simulatePurchase>[1]) => simulatePurchase(portfolioId, input) });
  const instrument = instruments.data?.find(item => item.id === selected) ?? instruments.data?.[0];
  function clear() { simulation.reset(); setValidation(''); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); clear();
    const fields = new FormData(event.currentTarget);
    const decimal = (name: string) => String(fields.get(name) ?? '').trim().replace(',', '.');
    const parsed = simulationInputSchema.safeParse({ instrumentId: instrument?.id, funding, budget: decimal('budget'), unitPrice: decimal('unitPrice'), commission: decimal('commission') });
    if (!parsed.success) { setValidation('Sprawdź instrument i kwoty. Użyj do 18 cyfr przed przecinkiem i 10 po przecinku.'); return; }
    simulation.mutate(parsed.data);
  }
  return <section id="simulator" className="investments" aria-labelledby="simulator-title">
    <div className="investment-heading"><div><span className="eyebrow">SPRAWDŹ SCENARIUSZ PRZED DECYZJĄ</span><h2 id="simulator-title"><FlaskConical size={22} />Symulator zakupu</h2></div><span className="pill">BEZ ZAPISU TRANSAKCJI</span></div>
    <div className="simulation-layout"><section className="panel investment-editor"><h3>Założenia zakupu</h3><p className="cash-help">Budżet obejmuje prowizję. Niewykorzystana reszta pozostaje gotówką w walucie instrumentu.</p>
      {instruments.isPending ? <p role="status">Pobieranie instrumentów…</p> : instruments.isError ? <p className="error" role="alert">{instruments.error.message} <button onClick={() => void instruments.refetch()}>Spróbuj ponownie</button></p> : !instrument ? <p className="cash-help">Dodaj instrument w sekcji Inwestycje, aby sprawdzić scenariusz. Nie musisz wcześniej zapisywać zakupu.</p> : <form onSubmit={submit} onChange={clear} aria-busy={simulation.isPending}><fieldset disabled={simulation.isPending}>
        <FormSelect label="Instrument symulacji" value={instrument.id} onValueChange={value => { setSelected(value); clear(); }} options={instruments.data.map(item => ({ value: item.id, label: `${item.symbol} · ${item.name} · ${item.currency}` }))} />
        <FormSelect label="Źródło środków" value={funding} onValueChange={value => { setFunding(value); clear(); }} options={[{ value: 'NEW_MONEY', label: 'Nowe środki' }, { value: 'EXISTING_CASH', label: 'Istniejąca gotówka' }]} />
        <p className="cash-help">{funding === 'NEW_MONEY' ? `Scenariusz dodaje cały budżet do subkonta ${instrument.currency}, a następnie opłaca zakup.` : `Cały budżet musi mieścić się w saldzie ${instrument.currency}. Bez automatycznej wymiany walut.`}</p>
        <label>Budżet symulacji ({instrument.currency})<input name="budget" inputMode="decimal" required maxLength={29} placeholder="np. 1000" /></label>
        <div className="cash-fields"><label>Cena zakupu w symulacji ({instrument.currency})<input name="unitPrice" inputMode="decimal" required maxLength={29} placeholder="Za 1 sztukę" /></label><label>Prowizja symulacji ({instrument.currency})<input name="commission" inputMode="decimal" required maxLength={29} defaultValue="0" /></label></div>
        <p className="cash-help">Ilość zaokrąglamy w dół do {instrument.quantityScale} miejsc. Wycena korzysta z oddzielnej ceny referencyjnej i aktualnego kursu ręcznego (maks. 72h). Nowa pozycja bez notowań przyjmuje cenę zakupu jako jawne założenie.</p>
        <Button type="submit" disabled={simulation.isPending}>{simulation.isPending ? 'Obliczanie…' : 'Oblicz symulację'}<ArrowRight size={17} /></Button>
      </fieldset></form>}
      {(validation || simulation.error) && <p role="alert" className="error">{validation || simulation.error?.message}</p>}
    </section><section className="panel simulation-result" aria-label="Wynik symulacji" aria-live="polite">
      {simulation.isPending ? <p role="status">Porównywanie portfela…</p> : simulation.data ? <SimulationResult data={simulation.data} /> : <div className="simulation-empty"><FlaskConical size={32} /><h3>Co zmieni ten zakup?</h3><p>Porównaj wartość, ilość, średni koszt i udział pozycji. Wynik pojawi się po obliczeniu scenariusza.</p><small>Symulacja nie zmienia sald ani historii i nie składa zlecenia.</small></div>}
    </section></div>
  </section>;
}
function SimulationResult({ data }: { data: Simulation }) {
  const { assumptions: a, before, after } = data;
  const previous = before.positions.find(item => item.instrumentId === a.instrumentId);
  const position = after.positions.find(item => item.instrumentId === a.instrumentId)!;
  const rows = [
    ['Wartość całego portfela (PLN)', money(before.totalValue), money(after.totalValue)],
    ['Ilość instrumentu (szt.)', money(previous?.quantity ?? '0'), money(position.quantity)],
    [`Średni koszt z prowizją (${a.currency}/szt.)`, previous?.averageCostLocal == null ? '—' : formatRounded(previous.averageCostLocal, 4), position.averageCostLocal == null ? '—' : formatRounded(position.averageCostLocal, 4)],
    ['Wartość pozycji (PLN)', money(previous ? previous.valueBase : '0'), money(position.valueBase)],
    ['Udział pozycji z gotówką', previous ? previous.weightPct === null ? '—' : formatPercent(previous.weightPct) : before.complete && before.totalValue !== '0' ? '0,00%' : '—', position.weightPct === null ? '—' : formatPercent(position.weightPct)],
    [`Gotówka na subkoncie (${a.currency})`, money(before.cash.find(item => item.currency === a.currency)?.amount), money(data.remainingCash)],
    ['Wpłaty netto (PLN)', money(before.netContributionsBase), money(after.netContributionsBase)],
  ];
  return <><h3>Porównanie przed i po</h3><p className="cash-help">{position.symbol} · {a.funding === 'NEW_MONEY' ? 'nowe środki' : 'istniejąca gotówka'} · stan na {formatDate(after.asOf)}. Ponów obliczenie, aby uwzględnić późniejsze zmiany portfela.</p>
    <div className="simulation-totals"><div><small>Dokupowana ilość</small><strong>{money(data.quantity)} szt.</strong></div><div><small>Koszt z prowizją</small><strong>{money(data.actualCost)} {a.currency}</strong></div><div><small>Reszta budżetu</small><strong>{money(data.budgetRemaining)} {a.currency}</strong></div></div>
    <table className="simulation-comparison"><caption className="sr-only">Portfel przed zakupem i po symulacji</caption><thead><tr><th scope="col">Miara</th><th scope="col">Przed</th><th scope="col">Po</th></tr></thead><tbody>{rows.map(([label, left, right]) => <tr key={label}><th scope="row">{label}</th><td>{left}</td><td>{right}</td></tr>)}</tbody></table>
    <p className="cash-help">Zmiana wartości całego portfela: <strong>{money(data.delta.totalValue)} PLN</strong>. Obejmuje dopłatę nowych środków, prowizję i różnicę ceny zakupu względem wyceny.</p>
    {(!before.complete || !after.complete) && <p className="data-issue" role="status">Niepełna wycena: brakuje aktualnych cen lub kursów. Pełna wartość i udziały pozostają niedostępne. Uzupełnij dane w sekcji Inwestycje.</p>}
    <details className="simulation-assumptions" open><summary>Ceny, kurs i założenia</summary><p>Budżet: {money(a.budget)} {a.currency} · zakup: {money(a.unitPrice)} {a.currency}/szt. · prowizja: {money(a.commission)} {a.currency}.</p><p>Cena referencyjna: {a.reference ? `${money(a.reference.price)} ${a.currency} · ${a.reference.source === 'scenario' ? 'założona cena scenariusza, brak notowań' : 'wpis ręczny'} · ${formatDate(a.reference.asOf)}` : 'brak; pozycja pozostaje bez pełnej wyceny'}.</p><p>FX: {money(a.fx.rate)} PLN za 1 {a.currency} · {a.fx.asOf ? `wpis ręczny z ${formatDate(a.fx.asOf)}` : 'kurs tożsamościowy PLN = 1'}.</p><small>Próg cen i FX: {after.quoteMaxAgeHours}h/{after.fxMaxAgeHours}h. Stare dane nie służą wycenie. Średni koszt w tabeli jest zaokrąglony do 4 miejsc. Służy analizie, bez rozliczenia podatkowego.</small></details>
  </>;
}
