import { z } from 'zod';
const origin = z.url().refine(value => new URL(value).origin === value, 'Use origin without trailing slash');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'), PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  MARKETSTACK_API_KEY: z.string().optional(),
  MARKETSTACK_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  MARKETSTACK_MONTHLY_BUDGET: z.coerce.number().int().min(1).max(100000).default(60),
  MARKETSTACK_DAILY_UTC_HOUR: z.coerce.number().int().min(0).max(23).default(19),
  DATABASE_URL: z.url().refine(v => /^postgres(ql)?:/.test(v)),
  BETTER_AUTH_SECRET: z.string().min(32).refine(v => !v.startsWith('replace-'), 'Generate a random auth secret'),
  BETTER_AUTH_URL: origin, WEB_ORIGIN: origin,
}).superRefine((v, ctx) => {
  if (v.MARKETSTACK_ENABLED && (!v.MARKETSTACK_API_KEY?.trim() || v.NODE_ENV !== 'development')) ctx.addIssue({ code: 'custom', message: 'Marketstack requires a backend key and local development mode; public licensing is unresolved' });
  if (v.BETTER_AUTH_URL !== v.WEB_ORIGIN) ctx.addIssue({ code: 'custom', message: 'Foundation expects a single browser origin' });
  if (v.NODE_ENV === 'production' && !v.WEB_ORIGIN.startsWith('https://')) ctx.addIssue({ code: 'custom', message: 'Production requires HTTPS' });
});
export const parseConfig = (env: NodeJS.ProcessEnv) => schema.parse(env);
export type Config = ReturnType<typeof parseConfig>;
