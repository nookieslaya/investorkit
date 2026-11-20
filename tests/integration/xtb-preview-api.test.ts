import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import { createDatabase, user, cashOperations, manualQuotes, fxRates, valuationSnapshots, journalEntries, instruments } from '@investorkit/db';
import { xtbPreviewSchema } from '@investorkit/shared';
import { buildApp } from '../../apps/api/src/app.js';
import { createAuth } from '../../apps/api/src/auth.js';
import { parseConfig } from '../../apps/api/src/config.js';
import { portfolioRepository } from '../../apps/api/src/portfolio-repository.js';
import { createContractValidator } from '../response-contract.js';
import { cellValue, editXlsx, xtbBytes } from '../xlsx-fixture.js';

const url = process.env.TEST_DATABASE_URL; if (!url) throw new Error('TEST_DATABASE_URL required');
const config = parseConfig({DATABASE_URL:url,NODE_ENV:'test',BETTER_AUTH_SECRET:'xtb-test-only-secret-32-characters-minimum',WEB_ORIGIN:'http://localhost:5173',BETTER_AUTH_URL:'http://localhost:5173'});
const {db,pool}=createDatabase(url), repo=portfolioRepository(db);
const app=await buildApp(config,{auth:createAuth(db,config),portfolios:repo,ready:async()=>{}},false), validator=await createContractValidator();
const prefix=`xtb-${randomUUID()}`;
let owner='',cookie='',portfolio='',foreign='',before='';
const input=(bytes: Buffer=xtbBytes)=>({fileName:'example.xlsx',contentBase64:bytes.toString('base64'),accountCurrency:'PLN',confirmCashTimesUtc:true});
async function hash() {
  const tables=await Promise.all([
    db.select().from(cashOperations).where(eq(cashOperations.ownerId,owner)),db.select().from(instruments).where(eq(instruments.ownerId,owner)),
    db.select().from(manualQuotes).where(eq(manualQuotes.ownerId,owner)),db.select().from(fxRates).where(eq(fxRates.ownerId,owner)),
    db.select().from(valuationSnapshots).where(eq(valuationSnapshots.ownerId,owner)),db.select().from(journalEntries).where(eq(journalEntries.ownerId,owner)),
  ]);return createHash('sha256').update(JSON.stringify(tables)).digest('hex');
}
async function call(payload:Record<string,unknown>, id=portfolio, session=cookie, origin=config.WEB_ORIGIN) {
  const response=await app.inject({method:'POST',url:`/api/v1/portfolios/${id}/imports/xtb-preview`,headers:{cookie:session,origin},payload});
  await validator.assert('/api/v1/portfolios/{id}/imports/xtb-preview','POST',response);return response;
}
beforeAll(async()=>{
  const response=await app.inject({method:'POST',url:'/api/auth/sign-up/email',headers:{origin:config.WEB_ORIGIN},payload:{name:'XLSX tester',email:`${prefix}@example.com`,password:'Test-only-passphrase-2026!'}});
  expect(response.statusCode).toBe(200);
  const cookies=response.headers['set-cookie'];cookie=(Array.isArray(cookies)?cookies:[cookies??'']).map(value=>value.split(';')[0]).join('; ');
  owner=(await db.select().from(user).where(eq(user.email,`${prefix}@example.com`)))[0]!.id;
  portfolio=(await repo.create(owner,{name:'XLSX preview',baseCurrency:'PLN'})).id;
  const other=`${prefix}-other`;await db.insert(user).values({id:other,name:'Other',email:`${other}@example.com`});foreign=(await repo.create(other,{name:'Foreign',baseCurrency:'PLN'})).id;
  await repo.createCashOperation(owner,portfolio,{kind:'DEPOSIT',currency:'PLN',amount:'123.4567890123',fxToBase:'1',fxAsOf:'2026-01-01T00:00:00Z',occurredAt:'2026-01-01T00:00:00Z',fxSource:'manual',note:'Existing ledger'},randomUUID());
  before=await hash();
});
afterAll(async()=>{await db.delete(user).where(like(user.email,`${prefix}%`));await app.close();await validator.close();await pool.end();});
describe('bounded XTB XLSX preview on isolated PostgreSQL',()=>{
  it('enforces session, origin, owner scope and strict metadata',async()=>{
    expect((await call(input(),portfolio,'')).statusCode).toBe(401);
    expect((await call(input(),portfolio,cookie,'https://example.invalid')).statusCode).toBe(403);
    expect((await call(input(),foreign)).statusCode).toBe(404);
    expect((await call({...input(),ownerId:owner})).statusCode).toBe(400);
    expect((await call({...input(),confirmCashTimesUtc:false})).statusCode).toBe(400);
  });
  it('returns source rows, preserved decimal strings, explicit roles and no inferred FX/financial result',async()=>{
    const response=await call(input());expect(response.statusCode,response.body).toBe(200);
    const data=xtbPreviewSchema.parse(response.json());expect(data.counts).toEqual({cashOperations:8,openLots:3,closedLots:2,rowsWithIssues:0});
    expect(data.sheets[1]!.rows[1]!.cells[5]).toBe('-1000');expect(data.canCommit).toBe(false);
    expect(data).not.toHaveProperty('totalValueBase');expect(data).not.toHaveProperty('operations');
    expect(response.headers['cache-control']).toContain('no-store');
  });
  it('rejects malformed archives/layout safely and retains unsupported cash rows with issues',async()=>{
    const malformed=await call(input(Buffer.from('not an archive')));expect(malformed.statusCode).toBe(422);expect(malformed.json().error.code).toBe('XLSX_ARCHIVE');
    const layout=editXlsx('xl/workbook.xml',xml=>xml.replace('Closed Positions','Unknown Sheet'));
    expect((await call(input(layout))).json().error.code).toBe('XTB_LAYOUT_UNSUPPORTED');
    const unsupported=editXlsx('xl/worksheets/sheet2.xml',xml=>cellValue(xml,'A6','Dividend','str'));
    const response=await call(input(unsupported));expect(response.statusCode,response.body).toBe(200);
    expect(xtbPreviewSchema.parse(response.json()).counts.rowsWithIssues).toBe(1);
    expect(await hash()).toBe(before);
  });
});
