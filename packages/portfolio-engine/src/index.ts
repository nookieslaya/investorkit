/** P01–P06: deterministic ledger replay, historical cost and valuation with completeness diagnostics. */
export { PORTFOLIO_ENGINE_VERSION } from './version.js';
export {
  DECIMAL_POLICY, DecimalDomainError, FinancialDecimal,
  parseAmount, parseUnitPrice, parseQuantity, parseCommission, sumDecimals,
} from './decimal.js';
export type { DecimalErrorCode, PercentageResult } from './decimal.js';

export { Position, PositionDomainError } from './position.js';
export type { PositionErrorCode, PositionSnapshot, TradeResult } from './position.js';
export { replayLedger, LedgerDomainError } from './ledger.js';
export type { LedgerErrorCode } from './ledger.js';
export { valuePortfolio, ValuationDomainError } from './valuation.js';

export { simulatePurchase, SimulationDomainError } from './simulation.js';

export { analyzeRisk, stressPortfolio, validateRiskSettings, RiskDomainError } from './risk.js';
