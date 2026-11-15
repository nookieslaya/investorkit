import Fastify, { LogController } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { fromNodeHeaders } from 'better-auth/node';
import { z, ZodError } from 'zod';
import { createPortfolioSchema, portfolioSchema } from '@investorkit/shared';
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
    if (err instanceof ZodError) return reply.code(400).send(fail('VALIDATION_ERROR', 'Sprawdź wprowadzone dane.', req.id));
    const error = err as { statusCode?: number; code?: string; cause?: { code?: string } };
    if (error.code === '23505' || error.cause?.code === '23505') return reply.code(409).send(fail('PORTFOLIO_LIMIT', 'Możesz utworzyć jeden portfel.', req.id));
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    // Avoid logging adapter errors that can include SQL params and private values.
    req.log.error({ requestId: req.id, code: error.code ?? 'INTERNAL_ERROR' }, 'Request failed');
    return reply.code(status).send(fail(status === 429 ? 'RATE_LIMITED' : 'REQUEST_FAILED', status === 500 ? 'Wystąpił błąd serwera.' : 'Nie można wykonać żądania.', req.id));
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send(fail('NOT_FOUND', 'Nie znaleziono zasobu.', req.id)));
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
    scoped.get('/portfolios', async req => {
      const rows = await services.portfolios.list(req.ownerId);
      return { items: rows.map(row => portfolioSchema.parse({ ...row, createdAt: row.createdAt.toISOString() })) };
    });
    scoped.get('/portfolios/:id', async (req, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(req.params);
      const row = await services.portfolios.find(req.ownerId, id);
      if (!row) return reply.code(404).send(fail('NOT_FOUND', 'Nie znaleziono portfela.', req.id));
      return portfolioSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
    });
    scoped.post('/portfolios', async (req, reply) => {
      const row = await services.portfolios.create(req.ownerId, createPortfolioSchema.parse(req.body));
      return reply.code(201).send(portfolioSchema.parse({ ...row, createdAt: row.createdAt.toISOString() }));
    });
  }, { prefix: '/api/v1' });
  return app;
}
declare module 'fastify' { interface FastifyRequest { ownerId: string } }
