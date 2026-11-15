import { pgTable, text, timestamp, boolean, uuid, uniqueIndex, index, check, numeric, bigserial, foreignKey } from 'drizzle-orm/pg-core';
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

export const cashOperations = pgTable('cash_operations', {
  id: uuid('id').primaryKey().defaultRandom(), ownerId: text('owner_id').notNull(),
  portfolioId: uuid('portfolio_id').notNull(), sequence: bigserial('sequence', { mode: 'number' }).notNull(),
  kind: text('kind').$type<'DEPOSIT' | 'WITHDRAWAL'>().notNull(),
  currency: text('currency').$type<'PLN' | 'EUR' | 'USD'>().notNull(),
  amount: numeric('amount', { precision: 28, scale: 10 }).notNull(),
  fxToBase: numeric('fx_to_base', { precision: 28, scale: 12 }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  fxAsOf: timestamp('fx_as_of', { withTimezone: true }).notNull(), fxSource: text('fx_source').$type<'manual'>().notNull(),
  note: text('note').notNull().default(''), idempotencyKey: uuid('idempotency_key').notNull(), requestHash: text('request_hash').notNull(),
  createdAt: created(),
}, t => [
  foreignKey({ columns: [t.portfolioId, t.ownerId], foreignColumns: [portfolios.id, portfolios.ownerId] }).onDelete('cascade'),
  uniqueIndex('cash_idempotency').on(t.portfolioId, t.idempotencyKey),
  index('cash_owner_portfolio').on(t.ownerId, t.portfolioId),
  check('cash_kind', sql`${t.kind} IN ('DEPOSIT','WITHDRAWAL')`),
  check('cash_currency', sql`${t.currency} IN ('PLN','EUR','USD')`),
  check('cash_amount_positive', sql`${t.amount} > 0`), check('cash_fx_positive', sql`${t.fxToBase} > 0`),
  check('cash_pln_fx', sql`${t.currency} <> 'PLN' OR ${t.fxToBase} = 1`),
  check('cash_fx_date', sql`${t.fxAsOf} <= ${t.occurredAt}`),
  check('cash_fx_source', sql`${t.fxSource} = 'manual'`), check('cash_note_length', sql`char_length(${t.note}) <= 300`),
]);
