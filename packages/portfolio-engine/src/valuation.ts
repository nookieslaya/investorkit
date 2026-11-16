import { ledgerOperationSchema, valuationQuoteSchema, fxInputSchema, valuationTimeSchema } from '@investorkit/shared';
import type { Currency } from '@investorkit/shared';
import { FinancialDecimal, parseAmount } from './decimal.js';
import { PORTFOLIO_ENGINE_VERSION } from './version.js';
import { replayLedgerState } from './ledger.js';

type Quote = { instrumentId: string; price: string; currency: Currency; asOf: string; source: 'manual' | 'scenario' };
type Rate = { currency: Currency; baseCurrency: 'PLN'; rate: string; asOf: string; source: 'manual' };
type Issue = 'MISSING_QUOTE' | 'STALE_QUOTE' | 'FUTURE_QUOTE' | 'MISSING_FX' | 'STALE_FX' | 'FUTURE_FX';
type UsedFx = { rate: string; asOf: string | null; source: 'manual' | 'identity' };
export class ValuationDomainError extends Error {
  constructor(readonly code: 'INVALID_MAX_AGE' | 'INVALID_FX' | 'QUOTE_CURRENCY_MISMATCH') { super(code); this.name = 'ValuationDomainError'; }
}
const zero = () => FinancialDecimal.parse('0');
function select<T extends { asOf: string }>(rows: readonly T[], asOf: number): T | undefined {
  // Last input wins equal timestamps. Repositories supply stable sequence ordering.
  return rows.reduce<T | undefined>((best, row) => Date.parse(row.asOf) <= asOf && (!best || Date.parse(row.asOf) >= Date.parse(best.asOf)) ? row : best, undefined);
}
export function valuePortfolioState(input: {
  instruments: readonly unknown[]; operations: readonly unknown[]; quotes: readonly Quote[]; fxRates: readonly Rate[];
  asOf: string; quoteMaxAgeHours?: number; fxMaxAgeHours?: number;
}) {
  const asOf = Date.parse(valuationTimeSchema.parse(input.asOf));
  const quoteMaxAgeHours = input.quoteMaxAgeHours ?? 72;
  const fxMaxAgeHours = input.fxMaxAgeHours ?? 72;
  for (const hours of [quoteMaxAgeHours, fxMaxAgeHours]) if (!Number.isFinite(hours) || hours <= 0 || hours > 8760) throw new ValuationDomainError('INVALID_MAX_AGE');
  const quotes = input.quotes.map(raw => ({ ...valuationQuoteSchema.parse({ price: raw.price, currency: raw.currency, asOf: raw.asOf, source: raw.source }), instrumentId: raw.instrumentId }));
  const rates = input.fxRates.map(raw => fxInputSchema.parse({ currency: raw.currency, baseCurrency: raw.baseCurrency, rate: raw.rate, asOf: raw.asOf, source: raw.source }));
  for (const rate of rates) {
    const parsed = FinancialDecimal.parseFxRate(rate.rate);
    if (rate.currency === 'PLN' && parsed.compare(FinancialDecimal.parse('1')) !== 0) throw new ValuationDomainError('INVALID_FX');
  }
  const operations = input.operations.map(raw => ledgerOperationSchema.parse(raw)).filter(operation => Date.parse(operation.occurredAt) <= asOf);
  const ledger = replayLedgerState({ instruments: input.instruments, operations, asOf: input.asOf });
  const dates: string[] = [];
  const readFx = (currency: Currency): { data: UsedFx | null; issue: Issue | null; value: FinancialDecimal | null } => {
    if (currency === 'PLN') return { data: { rate: '1', asOf: null, source: 'identity' }, issue: null, value: FinancialDecimal.parse('1') };
    const candidates = rates.filter(rate => rate.currency === currency);
    const rate = select(candidates, asOf);
    if (!rate) return { data: null, value: null, issue: candidates.length ? 'FUTURE_FX' : 'MISSING_FX' };
    const data: UsedFx = { rate: rate.rate, asOf: rate.asOf, source: rate.source };
    if (asOf - Date.parse(rate.asOf) > fxMaxAgeHours * 3600000) return { data, value: null, issue: 'STALE_FX' };
    return { data, value: FinancialDecimal.parseFxRate(rate.rate), issue: null };
  };
  let subtotal = zero();
  let realized = zero();
  const positions = ledger.positions.filter(state => !state.local.quantity.isZero()).map(({ local, costBase }) => {
    const { instrumentId, currency } = local.instrument;
    const candidates = quotes.filter(quote => quote.instrumentId === instrumentId);
    if (candidates.some(quote => quote.currency !== currency)) throw new ValuationDomainError('QUOTE_CURRENCY_MISMATCH');
    const quote = select(candidates, asOf);
    const fx = readFx(currency);
    const issues: Issue[] = [];
    if (!quote) issues.push(candidates.length ? 'FUTURE_QUOTE' : 'MISSING_QUOTE');
    else if (asOf - Date.parse(quote.asOf) > quoteMaxAgeHours * 3600000) issues.push('STALE_QUOTE');
    if (fx.issue) issues.push(fx.issue);
    const value = issues.length || !quote || !fx.value ? null : local.quantity.times(parseAmount(quote.price)).times(fx.value);
    if (value && quote) { subtotal = subtotal.plus(value); dates.push(quote.asOf); if (fx.data?.asOf) dates.push(fx.data.asOf); }
    const unrealized = value?.minus(costBase) ?? null;
    return {
      instrumentId, currency, quantity: local.quantity.toString(), remainingCostBase: costBase.toStorageString(),
      averageCostLocal: local.averageCostLocal?.toString() ?? null, valueBase: value?.toStorageString() ?? null,
      unrealizedBase: unrealized?.toStorageString() ?? null, unrealizedPct: unrealized?.percentOf(costBase).value?.toString() ?? null,
      quote: quote ? { price: quote.price, asOf: quote.asOf, source: quote.source } : null, fx: fx.data, issues, rawValue: value,
    };
  });
  for (const position of ledger.positions) realized = realized.plus(position.realizedBase);
  const cash = (['PLN', 'EUR', 'USD'] as const).map(currency => {
    const amount = ledger.balances[currency];
    // A zero subaccount needs no market FX; it contributes exactly zero.
    const fx = readFx(currency);
    const issues = amount.isZero() || !fx.issue ? [] : [fx.issue];
    const value = amount.isZero() ? zero() : fx.value ? amount.times(fx.value) : null;
    if (value) { subtotal = subtotal.plus(value); if (!amount.isZero() && fx.data?.asOf) dates.push(fx.data.asOf); }
    return { currency, amount: amount.toStorageString(), valueBase: value?.toStorageString() ?? null, fx: fx.data, issues, rawValue: value };
  });
  const complete = positions.every(position => !position.issues.length) && cash.every(account => !account.issues.length);
  const pnl = complete ? subtotal.minus(ledger.netContributionsBase) : null;
  const percentage = pnl?.percentOf(ledger.netContributionsBase);
  dates.sort((a, b) => Date.parse(a) - Date.parse(b));
  return { totalValue: complete ? subtotal : null,
    cashValues: new Map(cash.map(account => [account.currency, account.rawValue])),
    positionValues: new Map(positions.map(position => [position.instrumentId, position.rawValue])),
    snapshot: {
    asOf: input.asOf, engineVersion: PORTFOLIO_ENGINE_VERSION, baseCurrency: 'PLN' as const, complete,
    totalValue: complete ? subtotal.toStorageString() : null, pricedSubtotal: subtotal.toStorageString(),
    netContributionsBase: ledger.netContributionsBase.toStorageString(), pnl: pnl?.toStorageString() ?? null,
    pnlPct: percentage?.value?.toString() ?? null, pnlPctReason: !complete ? 'INCOMPLETE_VALUATION' as const : percentage?.reason ?? null,
    realizedBase: realized.toStorageString(), quoteMaxAgeHours, fxMaxAgeHours,
    valuationRange: dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null,
    positions: positions.map(({ rawValue, ...position }) => ({ ...position, weightPct: complete && rawValue ? rawValue.percentOf(subtotal).value?.toString() ?? null : null })), cash: cash.map(({ rawValue: _rawValue, ...account }) => account),
  } };
}
export function valuePortfolio(input: Parameters<typeof valuePortfolioState>[0]) { return valuePortfolioState(input).snapshot; }
