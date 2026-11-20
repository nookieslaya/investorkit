import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import { createDatabase, user, cashOperations, manualQuotes, fxRates, valuationSnapshots, journalEntries, instruments } from '@investorkit/db';
import { csvPreviewSchema } from '@investorkit/shared';
import { buildApp } from '../../apps/api/src/app.js';
import { createAuth } from '../../apps/api/src/auth.js';
import { parseConfig } from '../../apps/api/src/config.js';
import { portfolioRepository } from '../../apps/api/src/portfolio-repository.js';
import { createContractValidator } from '../response-contract.js';
const url = process.env.TEST_DATABASE_URL; if (!url) throw new Error('TEST_DATABASE_URL required');
const config = parseConfig({ DATABASE_URL:url, NODE_ENV:'test', BETTER_AUTH_SECRET:'integration-only-secret-32-characters-minimum', WEB_ORIGIN:'http://localhost:5173', BETTER_AUTH_URL:'http://localhost:5173' });
const {db,pool}=createDatabase(url); const repo=portfolioRepository(db);
const app=await buildApp(config,{auth:createAuth(db,config),portfolios:repo,ready:async()=>{}},false);
const validator=await createContractValidator(); const prefix=`csv-${randomUUID()}`;
let owner='',cookie='',portfolio='',foreign='',instrument='',before='';
const csv='kind;occurredAt;currency;amount\nDEPOSIT;2026-01-01T12:00:00Z;PLN;100,1234567890';
const body=(text=csv)=>({fileName:'private.csv',contentBase64:Buffer.from(text).toString('base64'),encoding:'utf-8',delimiter:';',decimalSeparator:',',mapping:{kind:0,occurredAt:1,currency:2,amount:3}});
async function hash(){
  const rows=await Promise.all([
    db.select().from(cashOperations).where(eq(cashOperations.ownerId,owner)), db.select().from(manualQuotes).where(eq(manualQuotes.ownerId,owner)),
    db.select().from(fxRates).where(eq(fxRates.ownerId,owner)), db.select().from(valuationSnapshots).where(eq(valuationSnapshots.ownerId,owner)),
    db.select().from(journalEntries).where(eq(journalEntries.ownerId,owner)), db.select().from(instruments).where(eq(instruments.ownerId,owner)),
  ]); return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
async function call(payload:Record<string,unknown>,id=portfolio,session=cookie){
  const r=await app.inject({method:'POST',url:`/api/v1/portfolios/${id}/imports/csv-preview`,headers:{origin:config.WEB_ORIGIN,cookie:session},payload});
  await validator.assert('/api/v1/portfolios/{id}/imports/csv-preview','POST',r); return r;
}
beforeAll(async()=>{
  const signup=await app.inject({method:'POST',url:'/api/auth/sign-up/email',headers:{origin:config.WEB_ORIGIN},payload:{name:'CSV tester',email:`${prefix}@example.com`,password:'Test-only-passphrase-2026!'}});
  expect(signup.statusCode).toBe(200);
  const cookies=signup.headers['set-cookie'];cookie=(Array.isArray(cookies)?cookies:[cookies??'']).map(x=>x.split(';')[0]).join('; ');
  const [row]=await db.select().from(user).where(eq(user.email,`${prefix}@example.com`));if(!row)throw new Error('Missing user');owner=row.id;
  portfolio=(await repo.create(owner,{name:'CSV tests',baseCurrency:'PLN'})).id;
  const other=`${prefix}-other`;await db.insert(user).values({id:other,name:'Other',email:`${prefix}-other@example.com`});foreign=(await repo.create(other,{name:'Foreign',baseCurrency:'PLN'})).id;
  instrument=(await repo.createInstrument(owner,{name:'DEMO',symbol:'DEMO',mic:'XWAR',currency:'PLN',type:'STOCK',quantityScale:3,isin:null,issuerCountry:null})).id;
  await repo.createCashOperation(owner,portfolio,{kind:'DEPOSIT',currency:'PLN',amount:'500',fxToBase:'1',fxAsOf:'2026-01-01T00:00:00Z',occurredAt:'2026-01-01T00:00:00Z',fxSource:'manual',note:'Existing ledger'},randomUUID());
  before=await hash();
});
afterAll(async()=>{await db.delete(user).where(like(user.email,`${prefix}%`));await app.close();await validator.close();await pool.end();});
describe('owner-scoped transient CSV preview on disposable PostgreSQL',()=>{
  it('requires a session and rejects forged owner metadata',async()=>{
    expect((await call(body(),portfolio,'')).statusCode).toBe(401);
    expect((await call({...body(),ownerId:owner})).statusCode).toBe(400);
  });
  it('shows raw rows before mapping, then exact normalized values without a commit route',async()=>{
    const first=await call({...body(),mapping:{}});expect(first.statusCode,first.body).toBe(200);
    expect(csvPreviewSchema.parse(first.json()).detection).toBe('needs_mapping');
    const second=await call(body());expect(second.statusCode,second.body).toBe(200);
    const result=csvPreviewSchema.parse(second.json());expect(result.counts.valid).toBe(1);expect(result.rows[0]?.operation).toHaveProperty('amount','100.1234567890');
    expect(result.canCommit).toBe(false);expect(result.blockedReason).toBe('PREVIEW_ONLY');
  });
  it('keeps duplicates and resolves trade identity only within the authenticated owner',async()=>{
    const text='kind;occurredAt;currency;symbol;mic;quantity;unitPrice;commission;commissionCurrency\nBUY;2026-01-01T12:00:00Z;PLN;DEMO;XWAR;0,125;80;0,5;PLN';
    const request={...body(text+'\n'+text.split('\n')[1]),mapping:{kind:0,occurredAt:1,currency:2,symbol:3,mic:4,quantity:5,unitPrice:6,commission:7,commissionCurrency:8}};
    const result=csvPreviewSchema.parse((await call(request)).json());expect(result.rows).toHaveLength(2);expect(result.counts.valid).toBe(2);
    expect(result.rows[0]?.operation).toHaveProperty('instrumentId',instrument);
    expect((await call(body(),foreign)).statusCode).toBe(404);
  });
  it('returns safe errors for blocked XTB, malformed CSV and invalid encoding',async()=>{
    expect((await call({...body(),adapterId:'xtb-verified'})).json().error.code).toBe('SAMPLE_REQUIRED');
    expect((await call(body('a;b\n"broken'))).json().error.code).toBe('CSV_QUOTING');
    expect((await call({...body(),contentBase64:Buffer.from([0xff,0x61,0x62]).toString('base64')})).json().error.code).toBe('CSV_ENCODING');
  });
  it('accepts a file larger than the usual64KiB body and leaves all financial data unchanged',async()=>{
    const row='DEPOSIT;2026-01-01T12:00:00Z;PLN;1';
    const response=await call(body('kind;occurredAt;currency;amount\n'+Array(2500).fill(row).join('\n')));
    expect(response.statusCode,response.body.slice(0,100)).toBe(200);expect(csvPreviewSchema.parse(response.json()).counts.valid).toBe(2500);
    expect(await hash()).toBe(before);
  });
});
