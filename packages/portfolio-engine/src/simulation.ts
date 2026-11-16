import { positionInstrumentSchema, simulationInputSchema, ledgerOperationSchema } from '@investorkit/shared';
import { FinancialDecimal, parseAmount, parseQuantity, parseUnitPrice } from './decimal.js';
import { replayLedgerState } from './ledger.js';
import { valuePortfolioState, valuePortfolio } from './valuation.js';
export class SimulationDomainError extends Error {
  constructor(readonly code: 'UNKNOWN_INSTRUMENT' | 'BUDGET_TOO_SMALL' | 'INSUFFICIENT_CASH' | 'SCENARIO_FX_REQUIRED') { super(code); this.name = 'SimulationDomainError'; }
}
type Context = Parameters<typeof valuePortfolio>[0];
export function simulatePurchase(context: Context, raw: unknown) {
  const input = simulationInputSchema.parse(raw);
  const instruments = context.instruments.map(item => positionInstrumentSchema.parse(item));
  const instrument = instruments.find(item => item.instrumentId === input.instrumentId);
  if (!instrument) throw new SimulationDomainError('UNKNOWN_INSTRUMENT');
  const operations = context.operations.map(item => ledgerOperationSchema.parse(item)).filter(item => Date.parse(item.occurredAt) <= Date.parse(context.asOf));
  const ledger = replayLedgerState({ instruments, operations, asOf: context.asOf });
  const beforeState = valuePortfolioState(context);
  const before = beforeState.snapshot;
  const budget = parseAmount(input.budget); const fee = parseAmount(input.commission); const price = parseUnitPrice(input.unitPrice);
  if (budget.compare(fee) <= 0) throw new SimulationDomainError('BUDGET_TOO_SMALL');
  if (input.funding === 'EXISTING_CASH' && budget.compare(ledger.balances[instrument.currency]) > 0) throw new SimulationDomainError('INSUFFICIENT_CASH');
  const quantity = budget.minus(fee).dividedByFloor(price, instrument.quantityScale);
  if (quantity.isZero()) throw new SimulationDomainError('BUDGET_TOO_SMALL');
  // Quantity must also fit the ledger input range; never round it for serialization.
  parseQuantity(quantity.toString(), instrument.quantityScale);
  const cost = quantity.times(price).plus(fee);
  const account = before.cash.find(item => item.currency === instrument.currency)!;
  if (!account.fx || account.issues.length || (account.fx.asOf && Date.parse(context.asOf) - Date.parse(account.fx.asOf) > before.fxMaxAgeHours * 3600000)) throw new SimulationDomainError('SCENARIO_FX_REQUIRED');
  const fx = account.fx;
  const common = { currency: instrument.currency, fxToBase: fx.rate, fxAsOf: fx.asOf ?? context.asOf, fxSource: 'manual' as const, occurredAt: context.asOf, note: '' };
  const simulated = [...operations];
  if (input.funding === 'NEW_MONEY') simulated.push({ ...common, kind: 'DEPOSIT', amount: input.budget });
  simulated.push({ ...common, kind: 'BUY', instrumentId: instrument.instrumentId, quantity: quantity.toString(), unitPrice: input.unitPrice, commission: input.commission, commissionCurrency: instrument.currency });
  const quotes = [...context.quotes];
  const held = ledger.positions.some(item => item.local.instrument.instrumentId === instrument.instrumentId && !item.local.quantity.isZero());
  // Only a new position with no quote records may assume the purchase price.
  // Stale/future records and missing quotes on existing holdings stay diagnostic.
  if (!held && !quotes.some(item => item.instrumentId === instrument.instrumentId)) quotes.push({ instrumentId: instrument.instrumentId, currency: instrument.currency, price: input.unitPrice, asOf: context.asOf, source: 'scenario' });
  const afterState = valuePortfolioState({ ...context, operations: simulated, quotes });
  const after = afterState.snapshot;
  const position = after.positions.find(item => item.instrumentId === instrument.instrumentId)!;
  const difference = (a: FinancialDecimal | null, b: FinancialDecimal | null) => a === null || b === null ? null : a.minus(b).toStorageString();
  const rate = FinancialDecimal.parseFxRate(fx.rate);
  const commissionBase = fee.times(rate);
  // Isolate this purchase from capital contributions and pre-existing holdings.
  // Other unpriced holdings do not hide the result of a priced purchase.
  const priceDifferenceBase = position.quote && position.issues.length === 0
    ? quantity.times(parseAmount(position.quote.price).minus(price)).times(rate) : null;
  const netEffectBase = priceDifferenceBase?.minus(commissionBase) ?? null;
  const newMoneyBase = input.funding === 'NEW_MONEY' ? budget.times(rate) : FinancialDecimal.parse('0');
  return {
    impact: { newMoneyBase: newMoneyBase.toStorageString(), commissionBase: commissionBase.toStorageString(),
      priceDifferenceBase: priceDifferenceBase?.toStorageString() ?? null, netEffectBase: netEffectBase?.toStorageString() ?? null,
      netEffectPct: netEffectBase?.percentOf(cost.times(rate)).value?.toString() ?? null },
    assumptions: { ...input, currency: instrument.currency, quantityScale: instrument.quantityScale, reference: position.quote, fx },
    quantity: quantity.toString(), actualCost: cost.toString(), budgetRemaining: budget.minus(cost).toString(),
    remainingCash: ledger.balances[instrument.currency].plus(input.funding === 'NEW_MONEY' ? budget : FinancialDecimal.parse('0')).minus(cost).toString(),
    before, after, delta: { totalValue: difference(afterState.totalValue, beforeState.totalValue), positionValue: difference(afterState.positionValues.get(instrument.instrumentId) ?? null, beforeState.positionValues.has(instrument.instrumentId) ? beforeState.positionValues.get(instrument.instrumentId)! : FinancialDecimal.parse('0')) },
  };
}
