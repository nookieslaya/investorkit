import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChartNoAxesCombined, RefreshCw } from 'lucide-react';
import { riskSettingsInputSchema, stressInputSchema } from '@investorkit/shared';
import type { Risk, RiskSettings, RiskSettingsInput, Stress, Valuation } from '@investorkit/shared';
import { Button } from '../components/ui/button';
import { FormSelect } from '../components/ui/form-select';
import { loadRisk, saveRiskSettings, runStress } from '../lib/api';
import { formatAmount, formatDate, formatMoney, formatPercent, trimDecimal } from '../lib/format';
const money = (value: string | null) => value === null ? '—' : formatMoney(value);
const percent = (value: string | null) => value === null ? '—' : formatPercent(value);
const issueNames = { MISSING_QUOTE: 'brak ceny', STALE_QUOTE: 'nieaktualna cena', FUTURE_QUOTE: 'cena z przyszłości', MISSING_FX: 'brak FX', STALE_FX: 'nieaktualny FX', FUTURE_FX: 'FX z przyszłości' };
function DataWarnings({ valuation }: { valuation: Valuation }) {
  if (valuation.complete) return null;
  const messages = [...valuation.positions.filter(row => row.issues.length).map(row => `${row.symbol}: ${row.issues.map(issue => issueNames[issue]).join(', ')}`), ...valuation.cash.filter(row => row.issues.length).map(row => `${row.currency}: ${row.issues.map(issue => issueNames[issue]).join(', ')}`)];
  return <div className="risk-warning" role="status"><strong>Wycena niepełna</strong><p>{messages.join(' · ')}. Uzupełnij aktualne ceny i kursy w Inwestycjach. Pełne udziały i wartość scenariusza pozostają niedostępne.</p></div>;
}
function Threshold({ exceeded }: { exceeded: boolean | null }) {
  return <span className={exceeded === true ? 'risk-flag' : 'cash-help'}>{exceeded === null ? 'Brak pełnych danych' : exceeded ? 'Przekroczony Twój próg' : 'Próg nieprzekroczony'}</span>;
}
export function RiskOverview({ portfolioId }: { portfolioId: string }) {
  const query = useQuery({ queryKey: ['risk', portfolioId], queryFn: () => loadRisk(portfolioId), refetchInterval: 60000 });
  const client = useQueryClient();
  const [scope, setScope] = useState<'SECURITIES' | 'INSTRUMENT'>('SECURITIES');
  const [selected, setSelected] = useState('');
  const [formError, setFormError] = useState('');
  const stress = useMutation({ mutationFn: (input: Parameters<typeof runStress>[1]) => runStress(portfolioId, input) });
  const data = query.data;
  const position = data?.valuation.positions.find(row => row.instrumentId === selected) ?? data?.valuation.positions[0];
  function clearStress() { stress.reset(); setFormError(''); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); clearStress();
    const fields = new FormData(event.currentTarget);
    const dropPct = String(fields.get('dropPct') ?? '').trim().replace(',', '.');
    const input = stressInputSchema.safeParse(scope === 'SECURITIES' ? { scope, dropPct } : { scope, dropPct, instrumentId: position?.instrumentId });
    if (!input.success) { setFormError('Podaj spadek od 0 do 100% i wybierz zakres.'); return; }
    stress.mutate(input.data);
  }
  return <section id="risk" className="investments" aria-labelledby="risk-title">
    <div className="investment-heading"><div><span className="eyebrow">ZROZUM STRUKTURĘ PORTFELA</span><h2 id="risk-title"><ChartNoAxesCombined size={22} />Koncentracja i scenariusze</h2></div><Button variant="ghost" disabled={query.isFetching} onClick={() => { clearStress(); void query.refetch(); }}><RefreshCw size={16} />Odśwież dane</Button></div>
    {query.isPending ? <p role="status">Obliczanie koncentracji…</p> : query.isError ? <p role="alert" className="error">{query.error.message} <button onClick={() => void query.refetch()}>Spróbuj ponownie</button></p> : data && <>
      <DataWarnings valuation={data.valuation} />
      {data.concentration.reason === 'NON_POSITIVE_BASE' && <p className="cash-help" role="status">Brak dodatniej wartości portfela do obliczenia udziałów. Dodaj środki lub uzupełnij pozycje.</p>}
      <div className="risk-metrics" aria-label="Koncentracja portfela">{[
        { label: 'Największa pozycja', value: data.concentration.largestPositionPct, threshold: data.settings.maxPositionPct, flag: data.concentration.maxPositionExceeded },
        { label: 'Top 3 pozycji', value: data.concentration.top3Pct, threshold: data.settings.top3Pct, flag: data.concentration.top3Exceeded },
        { label: 'Top 5 pozycji', value: data.concentration.top5Pct, threshold: data.settings.top5Pct, flag: data.concentration.top5Exceeded },
      ].map(row => <article className="panel risk-metric" key={row.label}><h3>{row.label}</h3><strong>{percent(row.value)}</strong><p>Twój próg: {formatPercent(row.threshold)}</p><Threshold exceeded={row.flag} /></article>)}</div>
      <p className="cash-help">Udziały względem całego portfela z gotówką. Top 3/5 obejmuje papiery wartościowe, bez gotówki. Progi pomagają porządkować portfel; nie są uniwersalną oceną bezpieczeństwa.</p>
      <section className="panel risk-positions" aria-labelledby="risk-positions-title"><h3 id="risk-positions-title">Udziały pozycji</h3>{data.concentration.positions.length === 0 ? <p className="cash-help">Brak otwartych pozycji. Gotówkę zobaczysz w strukturze portfela.</p> : <ul>{data.concentration.positions.map(row => {
        const holding = data.valuation.positions.find(item => item.instrumentId === row.instrumentId)!;
        return <li key={row.instrumentId}><div><strong>{holding.symbol}</strong><span>{holding.name}</span></div><div><strong>{percent(row.weightPct)}</strong><span>{money(holding.valueBase)} PLN</span><Threshold exceeded={row.exceedsLimit} /></div></li>;
      })}</ul>}</section>
      <div className="risk-layout"><section className="panel risk-stress" aria-labelledby="stress-title"><h3 id="stress-title">Co jeśli ceny spadną?</h3><p className="cash-help">Scenariusz, nie prognoza. Gotówka i kursy FX pozostają bez zmian. Test nie zapisuje transakcji i nie zmienia portfela.</p><form onSubmit={submit} onChange={clearStress} aria-busy={stress.isPending}><fieldset disabled={stress.isPending}>
        <FormSelect label="Zakres spadku" value={scope} onValueChange={value => { setScope(value === 'INSTRUMENT' ? 'INSTRUMENT' : 'SECURITIES'); clearStress(); }} options={[{ value: 'SECURITIES', label: 'Wszystkie papiery' }, { value: 'INSTRUMENT', label: 'Jedna pozycja' }]} />
        {scope === 'INSTRUMENT' && <FormSelect label="Pozycja do testu" value={position?.instrumentId ?? ''} onValueChange={value => { setSelected(value); clearStress(); }} options={data.valuation.positions.map(row => ({ value: row.instrumentId, label: `${row.symbol} · ${row.name}` }))} />}
        <label>Spadek ceny (%)<input name="dropPct" inputMode="decimal" defaultValue="20" required maxLength={14} aria-describedby="stress-error" /></label>
        <p id="stress-error" role="alert" className="error">{formError || stress.error?.message}</p><Button type="submit" disabled={stress.isPending || (scope === 'INSTRUMENT' && !position)}>{stress.isPending ? 'Obliczanie…' : 'Oblicz scenariusz'}</Button>
      </fieldset></form>{stress.data && <StressResult data={stress.data} />}
      </section><section className="panel risk-structure" aria-labelledby="allocation-title"><h3 id="allocation-title">Struktura portfela</h3><Allocation title="Typ aktywów" rows={data.allocations.assetType} kind="assetType" /><Allocation title="Waluta notowania i gotówki" rows={data.allocations.currency} kind="currency" /><p className="cash-help">Waluta notowania nie opisuje całego ryzyka walutowego spółki lub ETF.</p><details><summary>Kraj emitenta / funduszu</summary><Allocation title="Kraj emitenta z gotówką osobno" rows={data.allocations.issuerCountry} kind="issuerCountry" /><p className="cash-help">Kraj emitenta ETF nie jest ekspozycją geograficzną jego aktywów. Nieznane kategorie pozostają w portfelu i mianowniku udziałów.</p></details></section></div>
      <SettingsEditor portfolioId={portfolioId} settings={data.settings} onSaved={async () => { clearStress(); await Promise.all([client.invalidateQueries({ queryKey: ['risk', portfolioId] }), client.invalidateQueries({ queryKey: ['valuation', portfolioId] })]); }} />
      <p className="cash-help">Stan na {formatDate(data.valuation.asOf)} · maksymalny wiek cen/FX: {data.settings.quoteMaxAgeHours}h/{data.settings.fxMaxAgeHours}h{data.valuation.valuationRange ? ` · wykorzystane dane: ${formatDate(data.valuation.valuationRange.from)} – ${formatDate(data.valuation.valuationRange.to)}` : ''}.</p>
    </>}
  </section>;
}
function Allocation({ title, rows, kind }: { title: string; rows: Risk['allocations']['assetType']; kind: keyof Risk['allocations'] }) {
  const countryNames = new Intl.DisplayNames(['pl'], { type: 'region' });
  const label = (key: string) => key === 'CASH' ? 'Gotówka' : key === 'UNKNOWN' ? kind === 'issuerCountry' ? 'Nieznany kraj emitenta' : 'Nieznany typ' : key === 'STOCK' ? 'Akcje' : key === 'ETF' ? 'ETF' : kind === 'issuerCountry' ? `${countryNames.of(key) ?? key} (${key})` : key;
  return <section className="risk-allocation" aria-label={title}><h4>{title}</h4>{rows.length === 0 ? <p className="cash-help">Brak aktywów do podziału.</p> : <ul>{rows.map(row => <li key={row.key}><div><span>{label(row.key)}</span><strong>{percent(row.weightPct)}</strong></div><div className="risk-bar" aria-hidden="true"><span style={{ width: row.weightPct === null ? '0%' : `${row.weightPct}%` }} /></div><small>{money(row.valueBase)} PLN</small></li>)}</ul>}</section>;
}
function StressResult({ data }: { data: Stress }) {
  return <section className="stress-result" aria-label="Wynik scenariusza" aria-live="polite"><DataWarnings valuation={data.before} /><dl>
    <div><dt>Wartość przed</dt><dd>{money(data.before.totalValue)} PLN</dd></div><div><dt>Wartość po</dt><dd>{money(data.after.totalValue)} PLN</dd></div><div><dt>Ubytek wartości</dt><dd>{money(data.lossBase)} PLN<small>{percent(data.lossPct)} całego portfela</small></dd></div>
  </dl><details><summary>Założenia i wartości pozycji</summary><p>Spadek {formatPercent(data.assumptions.dropPct)} · {data.assumptions.scope === 'SECURITIES' ? 'wszystkie papiery' : 'jedna pozycja'} · stan na {formatDate(data.before.asOf)}. Ponów obliczenie po zmianie portfela.</p><ul className="stress-holdings">{data.after.positions.map(row => {
    const before = data.before.positions.find(item => item.instrumentId === row.instrumentId)!;
    return <li key={row.instrumentId}><strong>{row.symbol}</strong><p>Wartość: {money(before.valueBase)} → {money(row.valueBase)} PLN · udział po: {percent(row.weightPct)}</p><p>Cena referencyjna: {money(row.referencePrice)} {row.currency}{before.quote ? ` · ${formatDate(before.quote.asOf)} · ${before.quote.source === 'manual' ? 'wpis ręczny' : 'założenie'}` : ''}. Cena scenariusza: {money(row.scenarioPrice)} {row.currency}.</p><p>FX: {before.fx ? `${formatAmount(before.fx.rate)} PLN/${row.currency} · ${before.fx.asOf ? `${formatDate(before.fx.asOf)} · wpis ręczny` : 'kurs tożsamościowy'}` : 'brak'}.</p></li>;
  })}</ul><p>Gotówka po: {data.after.cash.map(row => `${formatMoney(row.amount)} ${row.currency}`).join(' · ')}. Kwoty w widoku zaokrąglone do 2 miejsc; obliczenia zachowują precyzję silnika.</p></details></section>;
}
function SettingsEditor({ portfolioId, settings, onSaved }: { portfolioId: string; settings: RiskSettings; onSaved: () => Promise<void> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<RiskSettings | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const initial = draft ?? settings;
  const save = useMutation({ mutationFn: (input: RiskSettingsInput) => saveRiskSettings(portfolioId, input, initial.revision), onSuccess: async result => { setDraft(result); await onSaved(); setDraft(null); setSuccess('Ustawienia zapisane. Wycena i symulator używają nowych progów świeżości.'); } });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    const fields = new FormData(event.currentTarget);
    const decimal = (name: string) => String(fields.get(name) ?? '').trim().replace(',', '.');
    const input = riskSettingsInputSchema.safeParse({ maxPositionPct: decimal('maxPositionPct'), top3Pct: decimal('top3Pct'), top5Pct: decimal('top5Pct'), quoteMaxAgeHours: Number(fields.get('quoteMaxAgeHours')), fxMaxAgeHours: Number(fields.get('fxMaxAgeHours')) });
    if (!input.success) { setError('Progi: 0–100%. Wiek danych: pełne godziny od 1 do 8760.'); return; }
    save.mutate(input.data);
  }
  return <details className="panel risk-settings"><summary>Ustawienia progów i świeżości</summary><p className="cash-help">Własne progi koncentracji i maksymalny wiek ręcznych danych. Limit pozycji ≤ Top 3 ≤ Top 5. Wydłużenie wieku akceptuje starsze dane, ale ich nie aktualizuje.</p><form ref={formRef} key={initial.revision} onSubmit={submit} aria-busy={save.isPending} onChange={() => { if (!draft) setDraft(settings); setSuccess(''); }}><fieldset disabled={save.isPending}>
    <div className="risk-setting-fields">{([['maxPositionPct', 'Próg jednej pozycji (%)'], ['top3Pct', 'Próg Top 3 (%)'], ['top5Pct', 'Próg Top 5 (%)']] as const).map(([key, label]) => <label key={key}>{label}<input name={key} aria-describedby="risk-settings-error" inputMode="decimal" required maxLength={14} defaultValue={trimDecimal(initial[key]).replace('.', ',')} /></label>)}
      <label>Maksymalny wiek ceny (h)<input name="quoteMaxAgeHours" aria-describedby="risk-settings-error" type="number" min={1} max={8760} step={1} required defaultValue={initial.quoteMaxAgeHours} /></label><label>Maksymalny wiek FX (h)<input name="fxMaxAgeHours" aria-describedby="risk-settings-error" type="number" min={1} max={8760} step={1} required defaultValue={initial.fxMaxAgeHours} /></label>
    </div><p id="risk-settings-error" role="alert" className="error">{error || save.error?.message}</p><p role="status" className="cash-success">{success}</p><div className="risk-settings-actions"><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Zapisywanie…' : 'Zapisz ustawienia'}</Button><Button variant="ghost" type="button" disabled={save.isPending} onClick={() => { void onSaved().then(() => { setDraft(null); formRef.current?.reset(); setError(''); save.reset(); setSuccess(''); }); }}>Wczytaj aktualne ustawienia</Button></div>
  </fieldset></form></details>;
}
