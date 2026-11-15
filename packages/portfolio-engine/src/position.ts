import { positionInstrumentSchema, positionTradeSchema } from '@investorkit/shared';
import type { PositionInstrument } from '@investorkit/shared';
import { FinancialDecimal, parseCommission, parseQuantity, parseUnitPrice } from './decimal.js';

export type PositionErrorCode = 'INSTRUMENT_MISMATCH' | 'CURRENCY_MISMATCH' | 'COMMISSION_CURRENCY_MISMATCH' | 'INSUFFICIENT_QUANTITY';
export class PositionDomainError extends Error {
  constructor(readonly code: PositionErrorCode) {
    super(code);
    this.name = 'PositionDomainError';
  }
}
export interface PositionSnapshot extends Readonly<PositionInstrument> {
  readonly quantity: string;
  readonly remainingCostLocal: string;
  readonly averageCostLocal: string | null;
}
export interface TradeResult {
  readonly position: Position;
  readonly currency: PositionInstrument['currency'];
  readonly grossLocal: FinancialDecimal;
  readonly commissionLocal: FinancialDecimal;
  /** Prospective cash movement; balances and affordability are handled in P03. */
  readonly cashDeltaLocal: FinancialDecimal;
  readonly releasedCostLocal: FinancialDecimal;
  /** Realized analytical result for this trade only, in instrument currency. BUY returns zero. */
  readonly realizedLocal: FinancialDecimal;
}
const zero = () => FinancialDecimal.parse('0');

/** One instrument, one quote currency. Replay is explicit via successive immutable states.
 * Local analytical cost is not a tax cost or a PLN-valued portfolio result.
 */
export class Position {
  readonly instrument: Readonly<PositionInstrument>;
  readonly #quantity: FinancialDecimal;
  readonly #remainingCostLocal: FinancialDecimal;
  private constructor(instrument: PositionInstrument, quantity: FinancialDecimal, cost: FinancialDecimal) {
    this.instrument = Object.freeze({ ...instrument });
    this.#quantity = quantity;
    this.#remainingCostLocal = cost;
    Object.freeze(this);
  }
  static empty(instrument: unknown): Position {
    return new Position(positionInstrumentSchema.parse(instrument), zero(), zero());
  }
  get quantity(): FinancialDecimal { return this.#quantity; }
  get remainingCostLocal(): FinancialDecimal { return this.#remainingCostLocal; }
  get averageCostLocal(): FinancialDecimal | null {
    return this.#quantity.isZero() ? null : this.#remainingCostLocal.dividedBy(this.#quantity);
  }
  snapshot(): PositionSnapshot {
    return Object.freeze({
      ...this.instrument, quantity: this.#quantity.toString(),
      remainingCostLocal: this.#remainingCostLocal.toString(), averageCostLocal: this.averageCostLocal?.toString() ?? null,
    });
  }
  applyTrade(input: unknown): TradeResult {
    const trade = positionTradeSchema.parse(input);
    if (trade.instrumentId !== this.instrument.instrumentId) throw new PositionDomainError('INSTRUMENT_MISMATCH');
    if (trade.currency !== this.instrument.currency) throw new PositionDomainError('CURRENCY_MISMATCH');
    if (trade.commissionCurrency !== trade.currency) throw new PositionDomainError('COMMISSION_CURRENCY_MISMATCH');
    const quantity = parseQuantity(trade.quantity, this.instrument.quantityScale);
    const price = parseUnitPrice(trade.unitPrice);
    const commissionLocal = parseCommission(trade.commission);
    const grossLocal = quantity.times(price);
    if (trade.kind === 'BUY') {
      const cost = grossLocal.plus(commissionLocal);
      return Object.freeze({
        position: new Position(this.instrument, this.#quantity.plus(quantity), this.#remainingCostLocal.plus(cost)),
        currency: trade.currency, grossLocal, commissionLocal,
        cashDeltaLocal: zero().minus(cost), releasedCostLocal: zero(), realizedLocal: zero(),
      });
    }
    if (quantity.compare(this.#quantity) > 0) throw new PositionDomainError('INSUFFICIENT_QUANTITY');
    const closing = quantity.compare(this.#quantity) === 0;
    // Release directly from remaining cost, never from a rounded average. The last sale
    // releases all remaining cost so no rounding residue survives a full exit.
    const releasedCostLocal = closing ? this.#remainingCostLocal
      : this.#remainingCostLocal.times(quantity).dividedBy(this.#quantity);
    const proceeds = grossLocal.minus(commissionLocal);
    return Object.freeze({
      position: new Position(this.instrument, closing ? zero() : this.#quantity.minus(quantity),
        closing ? zero() : this.#remainingCostLocal.minus(releasedCostLocal)),
      currency: trade.currency, grossLocal, commissionLocal, cashDeltaLocal: proceeds,
      releasedCostLocal, realizedLocal: proceeds.minus(releasedCostLocal),
    });
  }
}
