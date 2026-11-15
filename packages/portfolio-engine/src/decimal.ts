import { Decimal } from 'decimal.js';

export const DECIMAL_POLICY = Object.freeze({
  precision: 40,
  rounding: 'HALF_EVEN',
  maxIntegerDigits: 18,
  amountScale: 10,
  maxQuantityScale: 10,
} as const);

// Keep calculation settings private and independent of other Decimal consumers.
const Calculation = Decimal.clone({ defaults: true, precision: DECIMAL_POLICY.precision, rounding: Decimal.ROUND_HALF_EVEN });
const canonicalDecimal = /^-?(0|[1-9]\d{0,17})(\.\d{1,10})?$/;
const storageLimit = new Calculation('1000000000000000000');
export type DecimalErrorCode = 'INVALID_DECIMAL' | 'NEGATIVE_VALUE' | 'NON_POSITIVE_VALUE'
  | 'INVALID_SCALE' | 'QUANTITY_SCALE_EXCEEDED' | 'DIVISION_BY_ZERO' | 'NON_FINITE_RESULT' | 'STORAGE_OVERFLOW';
export class DecimalDomainError extends Error {
  constructor(readonly code: DecimalErrorCode) {
    super(code);
    this.name = 'DecimalDomainError';
  }
}
function checkScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > DECIMAL_POLICY.maxQuantityScale) {
    throw new DecimalDomainError('INVALID_SCALE');
  }
}

/** Dimensionless arithmetic value; callers must keep currency and units explicit in domain DTOs.
 * Inputs are bounded decimal strings. Intermediate results keep 40 significant digits,
 * and may be signed or exceed the input/storage range until explicitly serialized.
 */
export class FinancialDecimal {
  readonly #value: Decimal;
  private constructor(value: Decimal) {
    if (!value.isFinite()) throw new DecimalDomainError('NON_FINITE_RESULT');
    this.#value = value;
    Object.freeze(this);
  }
  static parse(value: unknown): FinancialDecimal {
    if (typeof value !== 'string' || value.trim() !== value || !canonicalDecimal.test(value)) throw new DecimalDomainError('INVALID_DECIMAL');
    return new FinancialDecimal(new Calculation(value));
  }
  plus(other: FinancialDecimal): FinancialDecimal {
    return new FinancialDecimal(this.#value.plus(other.#value));
  }
  minus(other: FinancialDecimal): FinancialDecimal {
    return new FinancialDecimal(this.#value.minus(other.#value));
  }
  times(other: FinancialDecimal): FinancialDecimal {
    return new FinancialDecimal(this.#value.times(other.#value));
  }
  dividedBy(other: FinancialDecimal): FinancialDecimal {
    if (other.isZero()) throw new DecimalDomainError('DIVISION_BY_ZERO');
    return new FinancialDecimal(this.#value.dividedBy(other.#value));
  }
  compare(other: FinancialDecimal): number { return this.#value.comparedTo(other.#value); }
  isZero(): boolean { return this.#value.isZero(); }
  isNegative(): boolean { return !this.isZero() && this.#value.isNegative(); }
  decimalPlaces(): number { return this.#value.decimalPlaces(); }
  /** No exponent notation, padding, binary number conversion or storage rounding. */
  toString(): string { return this.isZero() ? '0' : this.#value.toFixed(); }
  toJSON(): string { return this.toString(); }
  /** Presentation boundary only. Never use formatted strings as intermediate values. */
  toFixed(scale: number): string {
    checkScale(scale);
    const rounded = this.#value.toDecimalPlaces(scale, Calculation.ROUND_HALF_EVEN);
    return rounded.isZero() ? new Calculation('0').toFixed(scale) : rounded.toFixed(scale);
  }
  /** Explicit numeric(28,10) storage boundary; reject overflow after rounding. */
  toStorageString(): string {
    const rounded = this.#value.toDecimalPlaces(DECIMAL_POLICY.amountScale, Calculation.ROUND_HALF_EVEN);
    if (rounded.abs().gte(storageLimit)) throw new DecimalDomainError('STORAGE_OVERFLOW');
    return rounded.isZero() ? '0' : rounded.toFixed();
  }
  /** Mathematical floor, including negative values. Input validation never floors silently. */
  floorToScale(scale: number): FinancialDecimal {
    checkScale(scale);
    return new FinancialDecimal(this.#value.toDecimalPlaces(scale, Calculation.ROUND_FLOOR));
  }
  percentOf(base: FinancialDecimal): PercentageResult {
    if (base.isNegative() || base.isZero()) return { value: null, reason: 'NON_POSITIVE_BASE' };
    // Multiply before division to avoid a second rounding of recurring quotients.
    return { value: this.times(FinancialDecimal.parse('100')).dividedBy(base), reason: null };
  }
}
export type PercentageResult = { value: FinancialDecimal; reason: null } | { value: null; reason: 'NON_POSITIVE_BASE' };

/** Money magnitude, including zero. Signed changes/P&L use FinancialDecimal.parse. */
export function parseAmount(value: unknown): FinancialDecimal {
  const amount = FinancialDecimal.parse(value);
  if (amount.isNegative()) throw new DecimalDomainError('NEGATIVE_VALUE');
  return amount;
}
export function parseUnitPrice(value: unknown): FinancialDecimal {
  const price = parseAmount(value);
  if (price.isZero()) throw new DecimalDomainError('NON_POSITIVE_VALUE');
  return price;
}
export function parseQuantity(value: unknown, quantityScale: number): FinancialDecimal {
  checkScale(quantityScale);
  const quantity = parseUnitPrice(value);
  if (quantity.decimalPlaces() > quantityScale) throw new DecimalDomainError('QUANTITY_SCALE_EXCEEDED');
  return quantity;
}
export const parseCommission = parseAmount;
export function sumDecimals(values: readonly FinancialDecimal[]): FinancialDecimal {
  return values.reduce((total, value) => total.plus(value), FinancialDecimal.parse('0'));
}
