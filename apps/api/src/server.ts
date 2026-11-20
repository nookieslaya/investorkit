import { createDatabase } from '@investorkit/db';
import { parseConfig } from './config.js';
import { createAuth } from './auth.js';
import { buildApp } from './app.js';
import { portfolioRepository } from './portfolio-repository.js';
import { marketDataService } from './market-data-service.js';
const config = parseConfig(process.env);
const { db, pool } = createDatabase(config.DATABASE_URL);
const market = marketDataService(db, config);
const app = await buildApp(config, {
  market, auth: createAuth(db, config), portfolios: portfolioRepository(db),
  ready: async () => { await pool.query('SELECT 1'); },
});
let updating = false;
const timer = setInterval(() => {
  if (!config.MARKETSTACK_ENABLED || updating || new Date().getUTCHours() < config.MARKETSTACK_DAILY_UTC_HOUR) return;
  updating = true;
  void market.daily().catch(() => app.log.warn({ code: 'MARKET_DAILY_FAILED' }, 'Daily market update failed')).finally(() => { updating = false; });
}, 60_000);
timer.unref();
app.addHook('onClose', async () => { clearInterval(timer); await pool.end(); });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void app.close(); });
await app.listen({ host: config.HOST, port: config.PORT });
