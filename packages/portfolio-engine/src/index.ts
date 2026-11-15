/** P01–P03: arithmetic, position cost and cash replay with historical FX. Valuation remains pending. */
export const PORTFOLIO_ENGINE_VERSION = '0.3.0-ledger';
export {
  DECIMAL_POLICY, DecimalDomainError, FinancialDecimal,
  parseAmount, parseUnitPrice, parseQuantity, parseCommission, sumDecimals,
} from './decimal.js';
export type { DecimalErrorCode, PercentageResult } from './decimal.js';

export { Position, PositionDomainError } from './position.js';
export type { PositionErrorCode, PositionSnapshot, TradeResult } from './position.js';
export { replayLedger, LedgerDomainError } from './ledger.js';
export type { LedgerErrorCode } from './ledger.js';
