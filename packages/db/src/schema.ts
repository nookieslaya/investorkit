import { pgTable, text, timestamp, boolean, uuid, uniqueIndex, index, check, numeric, bigserial, foreignKey, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());
export const user = pgTable('auth_user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false), image: text('image'),
  createdAt: created(), updatedAt: updated(),
});
export const session = pgTable('auth_session', {
  id: text('id').primaryKey(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(), createdAt: created(), updatedAt: updated(),
  ipAddress: text('ip_address'), userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, t => [index('session_user_idx').on(t.userId)]);
export const account = pgTable('auth_account', {
  id: text('id').primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'), password: text('password'), createdAt: created(), updatedAt: updated(),
}, t => [index('account_user_idx').on(t.userId), uniqueIndex('account_provider_identity').on(t.providerId, t.accountId)]);
export const verification = pgTable('auth_verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), createdAt: created(), updatedAt: updated(),
}, t => [index('verification_identifier_idx').on(t.identifier)]);
export const portfolios = pgTable('portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), baseCurrency: text('base_currency').$type<'PLN'>().notNull().default('PLN'),
  createdAt: created(), updatedAt: updated(),
}, t => [
  uniqueIndex('portfolios_one_per_owner').on(t.ownerId),
  uniqueIndex('portfolios_id_owner').on(t.id, t.ownerId),
  check('portfolio_name_length', sql`char_length(trim(${t.name})) BETWEEN 1 AND 80`),
  check('portfolio_currency_pln', sql`${t.baseCurrency} = 'PLN'`),
]);

export const instruments = pgTable('instruments', {
  id: uuid('id').primaryKey().defaultRandom(), ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').$type<'STOCK' | 'ETF'>().notNull(), symbol: text('symbol').notNull(), mic: text('mic').notNull(), name: text('name').notNull(),
  currency: text('currency').$type<'PLN' | 'EUR' | 'USD'>().notNull(), quantityScale: integer('quantity_scale').notNull(), isin: text('isin'), issuerCountry: text('issuer_country'), createdAt: created(),
}, t => [
  uniqueIndex('instrument_identity').on(t.ownerId, t.symbol, t.mic, t.currency),
  uniqueIndex('instrument_owner_currency').on(t.id, t.ownerId, t.currency),
  check('instrument_type', sql`${t.type} IN ('STOCK','ETF')`), check('instrument_currency', sql`${t.currency} IN ('PLN','EUR','USD')`),
  check('instrument_scale', sql`${t.quantityScale} BETWEEN 0 AND 10`), check('instrument_name', sql`char_length(trim(${t.name})) BETWEEN 1 AND 120`),
  check('instrument_symbol', sql`${t.symbol} ~ '^[A-Z0-9._-]{1,24}$'`), check('instrument_mic', sql`${t.mic} ~ '^[A-Z0-9]{4}$'`),
]);
export const manualQuotes = pgTable('manual_quotes', {
  id: uuid('id').primaryKey().defaultRandom(), ownerId: text('owner_id').notNull(), instrumentId: uuid('instrument_id').notNull(),
  currency: text('currency').$type<'PLN' | 'EUR' | 'USD'>().notNull(), price: numeric('price', { precision: 28, scale: 10 }).notNull(),
  asOf: timestamp('as_of', { withTimezone: true }).notNull(), source: text('source').$type<'manual'>().notNull(), sequence: bigserial('sequence', { mode: 'number' }).notNull(), createdAt: created(),
}, t => [
  foreignKey({ columns: [t.instrumentId, t.ownerId, t.currency], foreignColumns: [instruments.id, instruments.ownerId, instruments.currency] }).onDelete('cascade'),
  index('quote_owner_instrument').on(t.ownerId, t.instrumentId, t.asOf), check('quote_price', sql`${t.price} >= 0`), check('quote_source', sql`${t.source} = 'manual'`),
]);
export const fxRates = pgTable('fx_rates', {
  id: uuid('id').primaryKey().defaultRandom(), ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  currency: text('currency').$type<'PLN' | 'EUR' | 'USD'>().notNull(), baseCurrency: text('base_currency').$type<'PLN'>().notNull(),
  rate: numeric('rate', { precision: 28, scale: 12 }).notNull(), asOf: timestamp('as_of', { withTimezone: true }).notNull(), source: text('source').$type<'manual'>().notNull(),
  sequence: bigserial('sequence', { mode: 'number' }).notNull(), createdAt: created(),
}, t => [index('fx_owner_date').on(t.ownerId, t.currency, t.asOf), check('fx_positive', sql`${t.rate} > 0`), check('fx_currency', sql`${t.currency} IN ('PLN','EUR','USD') AND ${t.baseCurrency} = 'PLN'`), check('fx_pln', sql`${t.currency} <> 'PLN' OR ${t.rate} = 1`), check('fx_source', sql`${t.source} = 'manual'`)]);

export const cashOperations = pgTable('cash_operations', {
  id: uuid('id').primaryKey().defaultRandom(), ownerId: text('owner_id').notNull(),
  portfolioId: uuid('portfolio_id').notNull(), sequence: bigserial('sequence', { mode: 'number' }).notNull(),
  kind: text('kind').$type<'DEPOSIT' | 'WITHDRAWAL' | 'BUY' | 'SELL'>().notNull(),
  currency: text('currency').$type<'PLN' | 'EUR' | 'USD'>().notNull(),
  amount: numeric('amount', { precision: 28, scale: 10 }),
  instrumentId: uuid('instrument_id'), quantity: numeric('quantity', { precision: 28, scale: 10 }),
  unitPrice: numeric('unit_price', { precision: 28, scale: 10 }), commission: numeric('commission', { precision: 28, scale: 10 }),
  commissionCurrency: text('commission_currency').$type<'PLN' | 'EUR' | 'USD'>(),
  fxToBase: numeric('fx_to_base', { precision: 28, scale: 12 }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  fxAsOf: timestamp('fx_as_of', { withTimezone: true }).notNull(), fxSource: text('fx_source').$type<'manual'>().notNull(),
  note: text('note').notNull().default(''), idempotencyKey: uuid('idempotency_key').notNull(), requestHash: text('request_hash').notNull(),
  createdAt: created(),
}, t => [
  foreignKey({ columns: [t.portfolioId, t.ownerId], foreignColumns: [portfolios.id, portfolios.ownerId] }).onDelete('cascade'),
  foreignKey({ columns: [t.instrumentId, t.ownerId, t.currency], foreignColumns: [instruments.id, instruments.ownerId, instruments.currency] }),
  uniqueIndex('ledger_sequence').on(t.portfolioId, t.sequence),
  check('ledger_fields', sql`(${t.kind} IN ('DEPOSIT','WITHDRAWAL') AND ${t.amount} IS NOT NULL AND ${t.instrumentId} IS NULL AND ${t.quantity} IS NULL AND ${t.unitPrice} IS NULL AND ${t.commission} IS NULL AND ${t.commissionCurrency} IS NULL) OR (${t.kind} IN ('BUY','SELL') AND ${t.amount} IS NULL AND ${t.instrumentId} IS NOT NULL AND ${t.quantity} > 0 AND ${t.quantity} IS NOT NULL AND ${t.unitPrice} > 0 AND ${t.unitPrice} IS NOT NULL AND ${t.commission} >= 0 AND ${t.commission} IS NOT NULL AND ${t.commissionCurrency} = ${t.currency} AND ${t.commissionCurrency} IS NOT NULL)`),
  uniqueIndex('cash_idempotency').on(t.portfolioId, t.idempotencyKey),
  index('cash_owner_portfolio').on(t.ownerId, t.portfolioId),
  check('cash_kind', sql`${t.kind} IN ('DEPOSIT','WITHDRAWAL','BUY','SELL')`),
  check('cash_currency', sql`${t.currency} IN ('PLN','EUR','USD')`),
  check('cash_amount_positive', sql`${t.amount} > 0`), check('cash_fx_positive', sql`${t.fxToBase} > 0`),
  check('cash_pln_fx', sql`${t.currency} <> 'PLN' OR ${t.fxToBase} = 1`),
  check('cash_fx_date', sql`${t.fxAsOf} <= ${t.occurredAt}`),
  check('cash_fx_source', sql`${t.fxSource} = 'manual'`), check('cash_note_length', sql`char_length(${t.note}) <= 300`),
]);
