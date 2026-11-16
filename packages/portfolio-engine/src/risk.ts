import { DEFAULT_RISK_SETTINGS, riskSettingsInputSchema, riskInstrumentSchema, stressInputSchema } from '@investorkit/shared';
import { FinancialDecimal, parseAmount, sumDecimals } from './decimal.js';
import { valuePortfolioState } from './valuation.js';
type Context = Parameters<typeof valuePortfolioState>[0];
const zero = () => FinancialDecimal.parse('0');
export class RiskDomainError extends Error {
  constructor(readonly code: 'INVALID_THRESHOLDS' | 'TARGET_NOT_HELD' | 'DUPLICATE_CLASSIFICATION') { super(code); this.name = 'RiskDomainError'; }
}
export function validateRiskSettings(raw: unknown) {
  const settings = riskSettingsInputSchema.parse(raw);
  if (parseAmount(settings.maxPositionPct).compare(parseAmount(settings.top3Pct)) > 0 || parseAmount(settings.top3Pct).compare(parseAmount(settings.top5Pct)) > 0) throw new RiskDomainError('INVALID_THRESHOLDS');
  return settings;
}
export function analyzeRisk(context: Context, classifications: readonly unknown[], rawSettings: unknown = DEFAULT_RISK_SETTINGS) {
  const settings = validateRiskSettings(rawSettings);
  const metadata = classifications.map(row => riskInstrumentSchema.parse(row));
  if (new Set(metadata.map(row => row.instrumentId)).size !== metadata.length) throw new RiskDomainError('DUPLICATE_CLASSIFICATION');
  const state = valuePortfolioState({ ...context, quoteMaxAgeHours: settings.quoteMaxAgeHours, fxMaxAgeHours: settings.fxMaxAgeHours });
  const total = state.totalValue;
  const percent = (value: FinancialDecimal | null) => total && value ? value.percentOf(total).value : null;
  const exceeds = (value: FinancialDecimal | null, threshold: string) => value ? value.compare(parseAmount(threshold)) > 0 : null;
  const positions = [...state.snapshot.positions].sort((a, b) => {
    const left = state.positionValues.get(a.instrumentId); const right = state.positionValues.get(b.instrumentId);
    return state.snapshot.complete && left && right ? right.compare(left) || a.instrumentId.localeCompare(b.instrumentId) : a.instrumentId.localeCompare(b.instrumentId);
  });
  const top = (count: number) => percent(sumDecimals(positions.slice(0, count).map(row => state.positionValues.get(row.instrumentId) ?? zero())));
  const largest = top(1); const top3 = top(3); const top5 = top(5);
  type Bucket = { value: FinancialDecimal; missing: boolean };
  const groups = { assetType: new Map<string, Bucket>(), currency: new Map<string, Bucket>(), issuerCountry: new Map<string, Bucket>() };
  const add = (group: Map<string, Bucket>, key: string, value: FinancialDecimal | null) => {
    const current = group.get(key) ?? { value: zero(), missing: false };
    group.set(key, { value: value ? current.value.plus(value) : current.value, missing: current.missing || value === null });
  };
  for (const position of state.snapshot.positions) {
    const data = metadata.find(row => row.instrumentId === position.instrumentId);
    const value = state.positionValues.get(position.instrumentId) ?? null;
    add(groups.assetType, data?.type ?? 'UNKNOWN', value);
    add(groups.currency, position.currency, value);
    add(groups.issuerCountry, data?.issuerCountry ?? 'UNKNOWN', value);
  }
  for (const cash of state.snapshot.cash) {
    const value = state.cashValues.get(cash.currency) ?? null;
    if (value?.isZero()) continue;
    add(groups.assetType, 'CASH', value); add(groups.currency, cash.currency, value); add(groups.issuerCountry, 'CASH', value);
  }
  const serialize = (group: Map<string, Bucket>) => [...group.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => ({
    key, valueBase: bucket.missing ? null : bucket.value.toStorageString(), weightPct: bucket.missing ? null : percent(bucket.value)?.toString() ?? null,
  }));
  return {
    valuation: state.snapshot,
    concentration: {
      largestPositionPct: largest?.toString() ?? null, top3Pct: top3?.toString() ?? null, top5Pct: top5?.toString() ?? null,
      maxPositionExceeded: exceeds(largest, settings.maxPositionPct), top3Exceeded: exceeds(top3, settings.top3Pct), top5Exceeded: exceeds(top5, settings.top5Pct),
      reason: !state.snapshot.complete ? 'INCOMPLETE_VALUATION' as const : !total || total.isZero() ? 'NON_POSITIVE_BASE' as const : null,
      positions: positions.map(row => {
        const weight = percent(state.positionValues.get(row.instrumentId) ?? null);
        return { instrumentId: row.instrumentId, weightPct: weight?.toString() ?? null, exceedsLimit: exceeds(weight, settings.maxPositionPct) };
      }),
    },
    allocations: { assetType: serialize(groups.assetType), currency: serialize(groups.currency), issuerCountry: serialize(groups.issuerCountry) },
  };
}
export function stressPortfolio(context: Context, raw: unknown) {
  const input = stressInputSchema.parse(raw);
  const state = valuePortfolioState(context);
  const before = state.snapshot;
  if (input.scope === 'INSTRUMENT' && !before.positions.some(row => row.instrumentId === input.instrumentId)) throw new RiskDomainError('TARGET_NOT_HELD');
  const drop = parseAmount(input.dropPct).dividedBy(FinancialDecimal.parse('100'));
  const factor = FinancialDecimal.parse('1').minus(drop);
  const affected = (id: string) => input.scope === 'SECURITIES' || input.instrumentId === id;
  const affectedValue = sumDecimals([...state.positionValues.entries()].filter(([id]) => affected(id)).map(([, value]) => value ?? zero()));
  const loss = before.complete ? affectedValue.times(drop) : null;
  const totalAfter = state.totalValue && loss ? state.totalValue.minus(loss) : null;
  return {
    before,
    after: {
      totalValue: totalAfter?.toStorageString() ?? null, cash: before.cash,
      positions: before.positions.map(row => {
        const value = state.positionValues.get(row.instrumentId);
        const afterValue = value ? affected(row.instrumentId) ? value.times(factor) : value : null;
        const scenarioPrice = row.quote && row.issues.length === 0 ? affected(row.instrumentId) ? parseAmount(row.quote.price).times(factor) : parseAmount(row.quote.price) : null;
        return { instrumentId: row.instrumentId, currency: row.currency, valueBase: afterValue?.toStorageString() ?? null,
          weightPct: totalAfter && afterValue ? afterValue.percentOf(totalAfter).value?.toString() ?? null : null,
          referencePrice: row.quote?.price ?? null, scenarioPrice: scenarioPrice?.toString() ?? null,
        };
      }),
    },
    lossBase: loss?.toStorageString() ?? null, lossPct: loss && state.totalValue ? loss.percentOf(state.totalValue).value?.toString() ?? null : null,
    reason: !before.complete ? 'INCOMPLETE_VALUATION' as const : state.totalValue?.isZero() ? 'NON_POSITIVE_BASE' as const : null,
    assumptions: { scope: input.scope, instrumentId: input.scope === 'INSTRUMENT' ? input.instrumentId : null, dropPct: input.dropPct,
      fxConstant: true as const, cashUnaffected: true as const, quoteMaxAgeHours: before.quoteMaxAgeHours, fxMaxAgeHours: before.fxMaxAgeHours },
  };
}
