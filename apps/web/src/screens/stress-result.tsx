import { quoteSourceLabel } from '../lib/format';
import type { Stress } from '@investorkit/shared';
import { formatAmount, formatDate, formatDecrease, formatMoney, formatPercent, trimDecimal } from '../lib/format';
const money = (value: string | null) => value === null ? '—' : formatMoney(value);
const percent = (value: string | null) => value === null ? '—' : formatPercent(value);
const fxSource = (fx: Stress['before']['cash'][number]['fx'], currency: string) => fx ? `${formatAmount(fx.rate)} PLN/${currency} · ${fx.asOf ? `${formatDate(fx.asOf)} · wpis ręczny` : 'kurs tożsamościowy'}` : 'brak';
function PositionComparison({ before, after }: { before: Stress['before']['positions'][number]; after: Stress['after']['positions'][number] }) {
  const priceAvailable = !before.issues.some(issue => ['MISSING_QUOTE', 'STALE_QUOTE', 'FUTURE_QUOTE'].includes(issue));
  return <dl className="stress-position-comparison">
    <div><dt>Cena ({after.currency})</dt><dd>{money(priceAvailable ? after.referencePrice : null)} <span aria-label="zmienia się na">→</span> {money(after.scenarioPrice)}</dd></div>
    <div><dt>Wartość (PLN)</dt><dd>{money(before.valueBase)} <span aria-label="zmienia się na">→</span> {money(after.valueBase)}</dd></div>
    <div><dt>Udział w portfelu</dt><dd>{percent(before.weightPct)} <span aria-label="zmienia się na">→</span> {percent(after.weightPct)}</dd></div>
  </dl>;
}
export function StressResult({ data }: { data: Stress }) {
  const { before, after, assumptions, lossBase, lossPct } = data;
  const selectedAfter = after.positions.find(row => row.instrumentId === assumptions.instrumentId);
  const selectedBefore = before.positions.find(row => row.instrumentId === assumptions.instrumentId);
  const subject = assumptions.scope === 'SECURITIES' ? 'Spadek cen wszystkich papierów' : `Spadek ${selectedAfter?.symbol ?? 'wybranej pozycji'}`;
  const scenario = `${subject} o ${trimDecimal(assumptions.dropPct).replace('.', ',')}%`;
  const unchanged = trimDecimal(assumptions.dropPct) === '0' || (lossBase === '0' && lossPct === '0');
  const summary = !before.complete ? `${scenario}: pełny wpływ na portfel jest niedostępny. Uzupełnij brakujące lub nieaktualne ceny i kursy.`
    : unchanged ? `${scenario} nie zmieniłby wartości Twojego portfela.`
    : lossPct === null ? `${scenario}: zmiana procentowa jest niedostępna przy zerowej wartości portfela.`
    : `${scenario} obniżyłby wartość Twojego portfela o ${money(lossBase)} PLN, czyli ${percent(lossPct)}.`;
  return <section className="stress-result" aria-label="Wynik scenariusza" aria-live="polite">
    <p className="stress-summary">{summary}</p>
    <dl className="stress-portfolio-comparison">
      <div><dt>Wartość portfela przed → po</dt><dd><span>{money(before.totalValue)} PLN</span><span aria-label="zmienia się na">→</span><strong>{money(after.totalValue)} PLN</strong></dd></div>
      <div><dt>Zmiana wartości całego portfela</dt><dd className={lossBase !== null && lossBase !== '0' ? 'negative-result' : undefined}>{formatDecrease(lossBase, 'money')} PLN <span>/</span> {formatDecrease(lossPct, 'percent')}</dd></div>
    </dl>
    {assumptions.scope === 'INSTRUMENT' && selectedBefore && selectedAfter ? <section className="stress-selected-position" aria-label="Porównanie wybranej pozycji"><h4>{selectedAfter.symbol}</h4><p className="cash-help">{selectedAfter.name}</p><PositionComparison before={selectedBefore} after={selectedAfter} /></section>
      : assumptions.scope === 'SECURITIES' && <p className="cash-help">Zakres: wszystkie papiery ({after.positions.length} pozycji). Spadek dotyczy cen papierów; zmiana procentowa powyżej dotyczy całego portfela wraz z gotówką.</p>}
    <details className="stress-details"><summary>Szczegóły obliczeń</summary>
      <p>Stan na {formatDate(before.asOf)} · {scenario}. Wynik odpowiada danym z chwili obliczenia.</p>
      <ul className="stress-holdings">{after.positions.map(row => {
        const original = before.positions.find(item => item.instrumentId === row.instrumentId);
        return <li key={row.instrumentId}><h4>{row.symbol} · {row.name}</h4>{original && <><PositionComparison before={original} after={row} /><p>Cena referencyjna: {money(row.referencePrice)} {row.currency}{original.quote ? ` · ${formatDate(original.quote.asOf)} · ${quoteSourceLabel(original.quote.source)}` : ''}.</p><p>FX: {fxSource(original.fx, row.currency)}.</p></>}</li>;
      })}</ul>
      <p>Gotówka przed i po: {after.cash.map(row => `${formatMoney(row.amount)} ${row.currency}`).join(' · ')}.</p>
      {after.cash.map(row => <p key={row.currency}>FX gotówki {row.currency}: {row.fx === null && trimDecimal(row.amount) === '0' ? 'niewymagany przy zerowym saldzie' : fxSource(row.fx, row.currency)}.</p>)}
      <p>Ceny i FX wyceny: maksymalny wiek {assumptions.quoteMaxAgeHours}h/{assumptions.fxMaxAgeHours}h. Brakujące i nieaktualne dane nie dają pełnego wyniku. Kwoty i procenty wyświetlamy do 2 miejsc (HALF_EVEN); obliczenia zachowują pełną precyzję silnika.</p>
    </details>
  </section>;
}
