import { ledgerOperationSchema, positionInstrumentSchema } from '@investorkit/shared';
import type { Currency } from '@investorkit/shared';
import { FinancialDecimal, parseUnitPrice } from './decimal.js';
import { Position } from './position.js';

export type LedgerErrorCode = 'INSUFFICIENT_CASH' | 'INVALID_FX' | 'FUTURE_FX' | 'FUTURE_OPERATION' | 'INVALID_DATE' | 'UNKNOWN_INSTRUMENT' | 'DUPLICATE_INSTRUMENT';
export class LedgerDomainError extends Error {
  constructor(readonly code: LedgerErrorCode) { super(code); this.name = 'LedgerDomainError'; }
}
const zero = () => FinancialDecimal.parse('0');
function timestamp(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new LedgerDomainError('INVALID_DATE');
  return result;
}
export function replayLedger(input: { instruments?: readonly unknown[]; operations: readonly unknown[]; asOf: string }) {
  const asOf = timestamp(input.asOf);
  const balances: Record<Currency, FinancialDecimal> = { PLN: zero(), EUR: zero(), USD: zero() };
  const positions = new Map<string, { local: Position; costBase: FinancialDecimal; realizedBase: FinancialDecimal }>();
  for (const metadata of input.instruments ?? []) {
    const instrument = positionInstrumentSchema.parse(metadata);
    if (positions.has(instrument.instrumentId)) throw new LedgerDomainError('DUPLICATE_INSTRUMENT');
    positions.set(instrument.instrumentId, { local: Position.empty(instrument), costBase: zero(), realizedBase: zero() });
  }
  let netContributionsBase = zero();
  const operations = input.operations.map((raw, index) => {
    const operation = ledgerOperationSchema.parse(raw);
    return { operation, index, time: timestamp(operation.occurredAt) };
  }).sort((a, b) => a.time - b.time || a.index - b.index);
  for (const { operation, time } of operations) {
    if (time > asOf) throw new LedgerDomainError('FUTURE_OPERATION');
    if (timestamp(operation.fxAsOf) > time) throw new LedgerDomainError('FUTURE_FX');
    const fx = FinancialDecimal.parseFxRate(operation.fxToBase);
    if (operation.currency === 'PLN' && fx.compare(FinancialDecimal.parse('1')) !== 0) throw new LedgerDomainError('INVALID_FX');
    let cashDelta: FinancialDecimal;
    if ('amount' in operation) {
      const amount = parseUnitPrice(operation.amount);
      cashDelta = operation.kind === 'DEPOSIT' ? amount : zero().minus(amount);
      netContributionsBase = netContributionsBase.plus(cashDelta.times(fx));
    } else {
      const prior = positions.get(operation.instrumentId);
      if (!prior) throw new LedgerDomainError('UNKNOWN_INSTRUMENT');
      const { fxToBase: _fx, fxAsOf: _fxDate, fxSource: _source, occurredAt: _date, ...trade } = operation;
      const result = prior.local.applyTrade(trade);
      cashDelta = result.cashDeltaLocal;
      if (operation.kind === 'BUY') {
        positions.set(operation.instrumentId, { ...prior, local: result.position, costBase: prior.costBase.plus(zero().minus(cashDelta).times(fx)) });
      } else {
        const released = result.position.quantity.isZero() ? prior.costBase
          : prior.costBase.times(FinancialDecimal.parse(operation.quantity)).dividedBy(prior.local.quantity);
        positions.set(operation.instrumentId, {
          local: result.position, costBase: result.position.quantity.isZero() ? zero() : prior.costBase.minus(released),
          realizedBase: prior.realizedBase.plus(cashDelta.times(fx).minus(released)),
        });
      }
    }
    const next = balances[operation.currency].plus(cashDelta);
    if (next.isNegative()) throw new LedgerDomainError('INSUFFICIENT_CASH');
    balances[operation.currency] = next;
  }
  return {
    balances: (['PLN', 'EUR', 'USD'] as const).map(currency => ({ currency, amount: balances[currency].toStorageString() })),
    netContributionsBase: netContributionsBase.toStorageString(), baseCurrency: 'PLN' as const, operationCount: operations.length,
    positions: [...positions.values()].map(({ local, costBase, realizedBase }) => ({
      ...local.snapshot(), remainingCostBase: costBase.toStorageString(), realizedBase: realizedBase.toStorageString(),
      averageCostBase: local.quantity.isZero() ? null : costBase.dividedBy(local.quantity).toString(),
    })),
  };
}
