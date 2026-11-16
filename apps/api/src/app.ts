import Fastify, { LogController } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { fromNodeHeaders } from 'better-auth/node';
import { z, ZodError } from 'zod';
import { createPortfolioSchema, portfolioSchema, portfolioIdParamsSchema, cashOperationInputSchema, cashSummarySchema, cashHistorySchema, createInstrumentSchema, quoteInputSchema, fxInputSchema, ledgerOperationSchema, valuationQuerySchema, simulationInputSchema, stressInputSchema, riskSettingsInputSchema } from '@investorkit/shared';
import { CashApiError } from './cash-repository.js';
import { LedgerDomainError, DecimalDomainError, PositionDomainError, ValuationDomainError, SimulationDomainError, RiskDomainError } from '@investorkit/portfolio-engine';
import { buildOpenApiDocument } from './openapi.js';
import type { Auth } from './auth.js';
import type { Config } from './config.js';
import type { portfolioRepository } from './portfolio-repository.js';
interface Services { auth: Auth; portfolios: ReturnType<typeof portfolioRepository>; ready: () => Promise<void> }
export async function buildApp(config: Config, services: Services, logging = true) {
  const app = Fastify({
    logger: logging ? { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] } : false,
    bodyLimit: 64 * 1024, trustProxy: false, requestTimeout: 15000, logController: new LogController({ disableRequestLogging: true }),
  });
  const fail = (code: string, message: string, requestId: string) => ({ error: { code, message, requestId } });
  await app.register(helmet, { contentSecurityPolicy: false }); // API only; frontend CSP is a hosting responsibility.
  await app.register(rateLimit, { global: true, max: 100, timeWindow: 60000 });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && req.headers.origin !== config.WEB_ORIGIN) {
      return reply.code(403).send(fail('ORIGIN_REJECTED', 'Niedozwolone źródło żądania.', req.id));
    }
  });
  app.addHook('onResponse', async (req, reply) => {
    req.log.info({ route: req.routeOptions.url, statusCode: reply.statusCode, durationMs: reply.elapsedTime }, 'Request completed');
  });
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof CashApiError) return reply.code(err.statusCode).send(fail(err.code, err.message, req.id));
    if (err instanceof LedgerDomainError || err instanceof DecimalDomainError || err instanceof PositionDomainError || err instanceof ValuationDomainError || err instanceof SimulationDomainError || err instanceof RiskDomainError) {
      const message = err.code === 'INSUFFICIENT_CASH' ? 'Brak wystarczających środków w tej walucie.'
        : err.code === 'INVALID_THRESHOLDS' ? 'Próg pozycji musi być nie większy od Top 3, a Top 3 od Top 5.'
        : err.code === 'TARGET_NOT_HELD' ? 'Wybierz otwartą pozycję portfela.'
        : err.code === 'BUDGET_TOO_SMALL' ? 'Budżet po prowizji nie wystarcza na minimalną ilość instrumentu.'
        : err.code === 'SCENARIO_FX_REQUIRED' ? 'Uzupełnij aktualny kurs wyceny dla waluty instrumentu zgodnie z ustawionym limitem wieku danych.'
        : err.code === 'STORAGE_OVERFLOW' ? 'Wynik przekracza obsługiwany zakres kwot (18 cyfr przed przecinkiem).'
        : err.code === 'FUTURE_FX' ? 'Data kursu historycznego nie może być późniejsza niż data operacji.'
        : err.code === 'COMMISSION_CURRENCY_MISMATCH' ? 'Waluta prowizji musi być walutą transakcji.'
        : err.code === 'INSUFFICIENT_QUANTITY' ? 'Nie możesz sprzedać większej ilości niż posiadasz.'
        : 'Sprawdź kwotę, instrument, kurs i daty. Kurs PLN musi wynosić 1, a daty nie mogą być przyszłe.';
      return reply.code(422).send(fail(err.code, message, req.id));
    }
    if (err instanceof ZodError) return reply.code(400).send(fail('VALIDATION_ERROR', 'Sprawdź wprowadzone dane.', req.id));
    const error = err as { statusCode?: number; code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
    if ((error.code === '23505' || error.cause?.code === '23505') && (error.constraint ?? error.cause?.constraint) === 'instrument_identity') return reply.code(409).send(fail('INSTRUMENT_EXISTS', 'Instrument o tym symbolu, rynku i walucie już istnieje.', req.id));
    if (error.code === '23505' || error.cause?.code === '23505') return reply.code(409).send(fail('PORTFOLIO_LIMIT', 'Zasób już istnieje lub przekroczono limit jednego portfela.', req.id));
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    // Avoid logging adapter errors that can include SQL params and private values.
    req.log.error({ requestId: req.id, code: error.code ?? 'INTERNAL_ERROR' }, 'Request failed');
    return reply.code(status).send(fail(status === 429 ? 'RATE_LIMITED' : 'REQUEST_FAILED', status === 500 ? 'Wystąpił błąd serwera.' : 'Nie można wykonać żądania.', req.id));
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send(fail('NOT_FOUND', 'Nie znaleziono zasobu.', req.id)));
  app.get('/api/v1/openapi.json', async () => buildOpenApiDocument());
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_req, reply) => {
    try { await services.ready(); return { status: 'ok' }; }
    catch { return reply.code(503).send({ status: 'unavailable' }); }
  });
  app.route({ method: ['GET', 'POST'], url: '/api/auth/*', config: { rateLimit: { max: 20, timeWindow: 60000 } },
    async handler(req, reply) {
      const response = await services.auth.handler(new Request(new URL(req.url, config.BETTER_AUTH_URL), {
        method: req.method, headers: fromNodeHeaders(req.headers),
        ...(req.method === 'GET' || req.body === undefined ? {} : { body: JSON.stringify(req.body) }),
      }));
      reply.code(response.status);
      response.headers.forEach((value, key) => { if (key !== 'set-cookie') reply.header(key, value); });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(await response.text());
    },
  });
  app.register(async scoped => {
    scoped.decorateRequest('ownerId', '');
    scoped.addHook('preHandler', async (req, reply) => {
      const session = await services.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (!session) return reply.code(401).send(fail('UNAUTHENTICATED', 'Zaloguj się.', req.id));
      req.ownerId = session.user.id;
    });
    scoped.get('/instruments', async req => services.portfolios.listInstruments(req.ownerId));
    scoped.post('/instruments', async (req, reply) => reply.code(201).send(await services.portfolios.createInstrument(req.ownerId, createInstrumentSchema.parse(req.body))));
    scoped.get('/instruments/:id/quotes', async req => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      return services.portfolios.listQuotes(req.ownerId, id);
    });
    scoped.post('/instruments/:id/quotes', async (req, reply) => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      return reply.code(201).send(await services.portfolios.createQuote(req.ownerId, id, quoteInputSchema.parse(req.body)));
    });
    scoped.post('/fx-rates', async (req, reply) => reply.code(201).send(await services.portfolios.createFx(req.ownerId, fxInputSchema.parse(req.body))));
    scoped.get('/portfolios/:id/operations', async req => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      return services.portfolios.operationHistory(req.ownerId, id);
    });
    scoped.post('/portfolios/:id/operations', async (req, reply) => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      const key = z.uuid().parse(req.headers['idempotency-key']).toLowerCase();
      return reply.code(201).send(await services.portfolios.createOperation(req.ownerId, id, ledgerOperationSchema.parse(req.body), key));
    });
    scoped.get('/portfolios/:id/risk-settings', async (req, reply) => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      const result = await services.portfolios.getRiskSettings(req.ownerId, id);
      reply.header('ETag', `"${result.revision}"`);
      return result;
    });
    scoped.patch('/portfolios/:id/risk-settings', async (req, reply) => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      if (req.headers['if-match'] === undefined) throw new CashApiError(428, 'PRECONDITION_REQUIRED', 'Odśwież ustawienia przed zapisem.');
      const header = z.string().regex(/^"(0|[1-9]\d{0,9})"$/).parse(req.headers['if-match']);
      const revision = z.number().int().min(0).max(2147483647).parse(Number(header.slice(1, -1)));
      const result = await services.portfolios.updateRiskSettings(req.ownerId, id, riskSettingsInputSchema.parse(req.body), revision);
      reply.header('ETag', `"${result.revision}"`);
      return result;
    });
    scoped.get('/portfolios/:id/risk', async req => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      return services.portfolios.risk(req.ownerId, id);
    });
    scoped.post('/portfolios/:id/stress-tests', async req => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      return services.portfolios.stress(req.ownerId, id, stressInputSchema.parse(req.body));
    });
    scoped.post('/portfolios/:id/simulations', async req => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      return services.portfolios.simulate(req.ownerId, id, simulationInputSchema.parse(req.body));
    });
    scoped.get('/portfolios/:id/valuation', async req => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      const query = valuationQuerySchema.parse(req.query);
      return services.portfolios.valuation(req.ownerId, id, query.asOf ?? new Date().toISOString());
    });
    scoped.get('/portfolios', async req => {
      const rows = await services.portfolios.list(req.ownerId);
      return { items: rows.map(row => portfolioSchema.parse({ ...row, createdAt: row.createdAt.toISOString() })) };
    });
    scoped.get('/portfolios/:id', async (req, reply) => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      const row = await services.portfolios.find(req.ownerId, id);
      if (!row) return reply.code(404).send(fail('NOT_FOUND', 'Nie znaleziono portfela.', req.id));
      return portfolioSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
    });
    scoped.get('/portfolios/:id/cash', async req => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      return cashSummarySchema.parse(await services.portfolios.cashSummary(req.ownerId, id));
    });
    scoped.get('/portfolios/:id/cash-operations', async req => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      return cashHistorySchema.parse(await services.portfolios.cashHistory(req.ownerId, id));
    });
    scoped.post('/portfolios/:id/cash-operations', async (req, reply) => {
      const { id } = portfolioIdParamsSchema.parse(req.params);
      const key = z.uuid().parse(req.headers['idempotency-key']).toLowerCase();
      const input = cashOperationInputSchema.parse(req.body);
      return reply.code(201).send(await services.portfolios.createCashOperation(req.ownerId, id, input, key));
    });
    scoped.post('/portfolios', async (req, reply) => {
      const row = await services.portfolios.create(req.ownerId, createPortfolioSchema.parse(req.body));
      return reply.code(201).send(portfolioSchema.parse({ ...row, createdAt: row.createdAt.toISOString() }));
    });
  }, { prefix: '/api/v1' });
  return app;
}
declare module 'fastify' { interface FastifyRequest { ownerId: string } }
