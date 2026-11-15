/** P01 arithmetic foundation only; portfolio replay/BUY/SELL/valuation are not implemented. */
export const PORTFOLIO_ENGINE_VERSION = '0.1.0-arithmetic';
export {
  DECIMAL_POLICY, DecimalDomainError, FinancialDecimal,
  parseAmount, parseUnitPrice, parseQuantity, parseCommission, sumDecimals,
} from './decimal.js';
export type { DecimalErrorCode, PercentageResult } from './decimal.js';
