import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { user, session, account, verification } from '@investorkit/db';
import type { Database } from '@investorkit/db';
import type { Config } from './config.js';
export function createAuth(db: Database, config: Config) {
  return betterAuth({
    appName: 'InvestorKit', baseURL: config.BETTER_AUTH_URL, secret: config.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
    trustedOrigins: [config.WEB_ORIGIN],
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    advanced: { useSecureCookies: config.NODE_ENV === 'production', defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' } },
    rateLimit: { enabled: true, window: 60, max: 30 },
  });
}
export type Auth = ReturnType<typeof createAuth>;
