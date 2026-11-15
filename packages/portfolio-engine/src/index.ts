/** P01 arithmetic + P02 local-currency positions. Cash/FX, valuation and API integration remain pending. */
export const PORTFOLIO_ENGINE_VERSION = '0.2.0-positions';
export {
  DECIMAL_POLICY, DecimalDomainError, FinancialDecimal,
  parseAmount, parseUnitPrice, parseQuantity, parseCommission, sumDecimals,
} from './decimal.js';
export type { DecimalErrorCode, PercentageResult } from './decimal.js';

export { Position, PositionDomainError } from './position.js';
export type { PositionErrorCode, PositionSnapshot, TradeResult } from './position.js';
