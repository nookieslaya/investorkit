import { createDatabase } from '@investorkit/db';
import { parseConfig } from './config.js';
import { createAuth } from './auth.js';
import { buildApp } from './app.js';
import { portfolioRepository } from './portfolio-repository.js';
const config = parseConfig(process.env);
const { db, pool } = createDatabase(config.DATABASE_URL);
const app = await buildApp(config, {
  auth: createAuth(db, config), portfolios: portfolioRepository(db),
  ready: async () => { await pool.query('SELECT 1'); },
});
app.addHook('onClose', async () => { await pool.end(); });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void app.close(); });
await app.listen({ host: config.HOST, port: config.PORT });
