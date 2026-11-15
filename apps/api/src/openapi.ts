import { z } from 'zod';
import {
  apiErrorSchema, createPortfolioSchema, portfolioSchema, portfoliosSchema,
  portfolioIdParamsSchema, healthSchema, unavailableSchema, cashSummarySchema, cashHistorySchema, cashOperationInputSchema, cashOperationSchema, instrumentsSchema, createInstrumentSchema, instrumentSchema, quoteInputSchema, quoteSchema, fxInputSchema, fxSchema, ledgerOperationSchema, operationSchema, operationHistorySchema, valuationSchema, valuationTimeSchema,
} from '@investorkit/shared';

type ResponseContract = { description: string; schema: z.ZodType };
interface OperationContract {
  operationId: string;
  summary: string;
  authenticated?: boolean;
  idempotency?: boolean;
  valuationQuery?: boolean;
  body?: z.ZodType;
  params?: typeof portfolioIdParamsSchema;
  responses: Record<number, ResponseContract>;
}
const error = (description: string): ResponseContract => ({ description, schema: apiErrorSchema });
const commonErrors = { 429: error('Limit żądań.'), 500: error('Błąd serwera bez szczegółów wewnętrznych.') };
const protectedErrors = { ...commonErrors, 401: error('Brak ważnej sesji.') };

// Only implemented first-party operations. Better Auth owns /api/auth/* contracts.
export const apiContracts: Record<string, Partial<Record<'get' | 'post', OperationContract>>> = {
  '/api/v1/instruments': {
    get: { operationId: 'listInstruments', summary: 'Instrumenty właściciela (do 100).', authenticated: true, responses: { 200: { description: 'Własne instrumenty.', schema: instrumentsSchema }, ...protectedErrors } },
    post: { operationId: 'createInstrument', summary: 'Dodaj własny instrument STOCK/ETF.', authenticated: true, body: createInstrumentSchema,
      responses: { 201: { description: 'Instrument.', schema: instrumentSchema }, ...protectedErrors, 400: error('Błędne dane.'), 403: error('Origin.'), 409: error('Instrument już istnieje.'), 422: error('Limit instrumentów.'), 413: error('Limit body.'), 415: error('Content-Type.') } },
  },
  '/api/v1/instruments/{id}/quotes': { post: { operationId: 'createQuote', summary: 'Ręczna cena w walucie instrumentu; zero jest dozwolone, przyszła data odrzucona.', authenticated: true, params: portfolioIdParamsSchema, body: quoteInputSchema,
    responses: { 201: { description: 'Cena.', schema: quoteSchema }, ...protectedErrors, 400: error('Błędne dane.'), 403: error('Origin.'), 404: error('Brak/cudzy instrument.'), 422: error('Data, waluta lub limit 500 cen.'), 413: error('Limit body.'), 415: error('Content-Type.') } } },
  '/api/v1/fx-rates': { post: { operationId: 'createFx', summary: 'Ręczny kurs wyceny PLN za1 jednostkę; niezależny od historycznych kursów operacji.', authenticated: true, body: fxInputSchema,
    responses: { 201: { description: 'Kurs.', schema: fxSchema }, ...protectedErrors, 400: error('Błędne dane.'), 403: error('Origin.'), 422: error('Data, kurs lub limit 1000 kursów.'), 413: error('Limit body.'), 415: error('Content-Type.') } } },
  '/api/v1/portfolios/{id}/operations': {
    get: { operationId: 'operationHistory', summary: 'Wspólna historia wpłat/wypłat/BUY/SELL; najnowsze pierwsze, limit 1000 wpisów.', authenticated: true, params: portfolioIdParamsSchema,
      responses: { 200: { description: 'Historia.', schema: operationHistorySchema }, ...protectedErrors, 400: error('Błędny UUID.'), 404: error('Brak portfela.') } },
    post: { operationId: 'createOperation', summary: 'Operacja wspólnego ledgeru z blokadą, idempotencją i pełnym replay.', authenticated: true, params: portfolioIdParamsSchema, idempotency: true, body: ledgerOperationSchema,
      responses: { 201: { description: 'Operacja lub identyczna powtórka.', schema: operationSchema }, ...protectedErrors, 400: error('Błędne dane lub klucz.'), 403: error('Origin.'), 404: error('Brak portfela/instrumentu.'), 409: error('Konflikt klucza.'), 422: error('Debet, oversell, waluta, daty, overflow lub limit historii.'), 413: error('Limit body.'), 415: error('Content-Type.') } },
  },
  '/api/v1/portfolios/{id}/valuation': { get: { operationId: 'valuation', summary: 'Wycena z gotówką i nominalny P/L, świeżość 72h. Niekompletne dane dają totalValue/P&L null i pricedSubtotal.', authenticated: true, params: portfolioIdParamsSchema, valuationQuery: true,
    responses: { 200: { description: 'Wycena z kompletnością, źródłami i diagnostyką.', schema: valuationSchema }, ...protectedErrors, 400: error('Błędna data/UUID.'), 404: error('Brak portfela.'), 422: error('Przyszła wycena lub błąd domeny.') } } },
  '/api/v1/portfolios/{id}/cash': { get: {
    operationId: 'cashSummary', summary: 'Salda gotówki i wpłaty netto PLN według historycznych kursów.', authenticated: true, params: portfolioIdParamsSchema,
    responses: { 200: { description: 'Saldo każdego subkonta i historyczne wpłaty netto.', schema: cashSummarySchema }, ...protectedErrors, 400: error('Nieprawidłowy UUID.'), 404: error('Brak portfela.'), 422: error('Niedozwolony stan ledgeru.') },
  } },
  '/api/v1/portfolios/{id}/cash-operations': {
    get: { operationId: 'cashHistory', summary: 'Historia gotówki od najnowszej operacji; limit 1000 operacji na portfel.', authenticated: true, params: portfolioIdParamsSchema,
      responses: { 200: { description: 'Historia (wyłącznie właściciel).', schema: cashHistorySchema }, ...protectedErrors, 400: error('Nieprawidłowy UUID.'), 404: error('Brak portfela.') } },
    post: { operationId: 'createCashOperation', summary: 'Wpłata/wypłata z historycznym FX, blokadą portfela i idempotencją.', authenticated: true,
      params: portfolioIdParamsSchema, body: cashOperationInputSchema, idempotency: true,
      responses: { 201: { description: 'Zapisana operacja lub identyczne ponowienie.', schema: cashOperationSchema }, ...protectedErrors,
        400: error('Błędne dane lub brak UUID Idempotency-Key.'), 403: error('Niedozwolony Origin.'), 404: error('Brak portfela.'),
        409: error('Klucz użyty z innymi danymi.'), 413: error('Zbyt duże body.'), 415: error('Nieobsługiwany Content-Type.'), 422: error('Brak środków, błędny FX, przyszła data, przepełnienie lub limit operacji.') } },
  },
  '/health': { get: {
    operationId: 'health', summary: 'Liveness bez dostępu do bazy.',
    responses: { 200: { description: 'Serwer działa.', schema: healthSchema }, ...commonErrors },
  } },
  '/ready': { get: {
    operationId: 'ready', summary: 'Gotowość połączenia z bazą.',
    responses: { 200: { description: 'Baza dostępna.', schema: healthSchema }, 503: { description: 'Baza niedostępna.', schema: unavailableSchema }, ...commonErrors },
  } },
  '/api/v1/portfolios': {
    get: {
      operationId: 'listPortfolios', summary: 'Lista portfeli właściciela sesji (maksymalnie jeden).', authenticated: true,
      responses: { 200: { description: 'Lista bez paginacji w obecnym etapie.', schema: portfoliosSchema }, ...protectedErrors },
    },
    post: {
      operationId: 'createPortfolio', summary: 'Utwórz jeden portfel PLN dla właściciela sesji.', authenticated: true,
      body: createPortfolioSchema,
      responses: {
        201: { description: 'Utworzony portfel.', schema: portfolioSchema }, ...protectedErrors,
        400: error('Nieprawidłowe dane lub JSON.'), 403: error('Brak zgodnego nagłówka Origin.'),
        409: error('Właściciel ma już portfel.'), 413: error('Body przekracza 64 KiB.'), 415: error('Nieobsługiwany Content-Type.'),
      },
    },
  },
  '/api/v1/portfolios/{id}': { get: {
    operationId: 'getPortfolio', summary: 'Portfel właściciela; cudzy lub brakujący zasób zwraca 404.', authenticated: true,
    params: portfolioIdParamsSchema,
    responses: { 200: { description: 'Portfel.', schema: portfolioSchema }, ...protectedErrors, 400: error('Nieprawidłowy UUID.'), 404: error('Nie znaleziono portfela.') },
  } },
};

const jsonSchema = (schema: z.ZodType, io: 'input' | 'output') => z.toJSONSchema(schema, {
  target: 'openapi-3.0', io,
  override: ({ jsonSchema: converted }) => {
    // In OAS3 nullable widens type, but enum must independently admit null.
    if (converted.nullable === true && Array.isArray(converted.enum) && !converted.enum.includes(null)) converted.enum = [...converted.enum, null];
  },
});
export function buildOpenApiDocument() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'InvestorKit API', version: '0.1.0',
      description: 'Wdrożone endpointy własne. /api/auth/* deleguje do Better Auth i nie jest częścią tego dokumentu. /api/v1/openapi.json udostępnia ten dokument. Planowane funkcje opisuje docs/05-api.md.',
    },
    servers: [{ url: '/', description: 'Ten sam origin co frontend; /health i /ready bezpośrednio na API.' }],
    components: { securitySchemes: {
      session: { type: 'apiKey', in: 'cookie', name: '__Secure-better-auth.session_token', description: 'HttpOnly session cookie w produkcji HTTPS.' },
      localSession: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token', description: 'Wariant dla lokalnego HTTP.' },
    } },
    paths: Object.fromEntries(Object.entries(apiContracts).map(([path, methods]) => [path,
      Object.fromEntries(Object.entries(methods).map(([method, contract]) => [method, {
        operationId: contract.operationId, summary: contract.summary,
        security: contract.authenticated ? [{ session: [] }, { localSession: [] }] : [],
        parameters: [
          ...(contract.params ? [{ name: 'id', in: 'path', required: true, schema: jsonSchema(contract.params.shape.id, 'input') }] : []),
          ...(contract.body ? [{ name: 'Origin', in: 'header', required: true, description: 'Musi być równy WEB_ORIGIN.', schema: { type: 'string', format: 'uri' } }] : []),
          ...(contract.valuationQuery ? [{ name: 'asOf', in: 'query', required: false, description: 'UTC; domyślnie zegar serwera, przyszła data niedozwolona.', schema: jsonSchema(valuationTimeSchema, 'input') }] : []),
          ...(contract.idempotency ? [{ name: 'Idempotency-Key', in: 'header', required: true, description: 'UUID; ten sam klucz i body zwracają tę samą operację.', schema: { type: 'string', format: 'uuid' } }] : []),
        ],
        ...(contract.body ? {
          requestBody: { required: true, content: { 'application/json': { schema: jsonSchema(contract.body, 'input') } } },
        } : {}),
        responses: Object.fromEntries(Object.entries(contract.responses).map(([status, response]) => [status, {
          description: response.description, content: { 'application/json': { schema: jsonSchema(response.schema, 'output') } },
        }])),
      }])),
    ])),
  };
}
