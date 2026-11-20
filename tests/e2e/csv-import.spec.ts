import { expect, test } from '@playwright/test';
import { CSV_FIELDS, csvPreviewSchema } from '@investorkit/shared';
function csvRow(values: string[]) { return values.map(value => '"'+value.replaceAll('"','""')+'"').join(';'); }
const formula = '=HYPERLINK("https://example.invalid","<script id=csv-test>bad</script>")';
const cash = ['DEPOSIT','2026-01-15T12:00:00+01:00','PLN','100,1234567890','','','','','','','','',formula,'same-id'];
const unknown = ['BUY','2026-01-15T12:30:00+01:00','PLN','','UNKNOWN','XWAR','2','80','0','PLN','','','Unknown security','row-2'];
const file = [CSV_FIELDS.join(';'),csvRow(cash),csvRow(unknown),...Array.from({length:50},()=>csvRow(cash))].join('\r\n');
test('previews/maps a CSV through the real API without financial writes, clears stale results and keeps literal text', async ({ page,baseURL },testInfo)=>{
  test.setTimeout(90000);
  const headers={origin:baseURL!};
  expect((await page.request.post('/api/auth/sign-up/email',{headers,data:{name:'CSV tester',email:`csv-e2e-${Date.now()}@example.com`,password:'Test-only-passphrase-2026!'}})).status()).toBe(200);
  const portfolioResponse=await page.request.post('/api/v1/portfolios',{headers,data:{name:'CSV preview'}});expect(portfolioResponse.status()).toBe(201);
  const portfolio=(await portfolioResponse.json()).id as string;
  const before=await (await page.request.get(`/api/v1/portfolios/${portfolio}/operations`)).json();
  await page.goto('/#imports');
  const preview=page.getByRole('region',{name:'Podgląd CSV',exact:true});
  await expect(preview.getByText('Podgląd nie zapisuje transakcji i nie zmienia portfela.',{exact:true})).toBeVisible();
  await preview.getByLabel('Plik CSV',{exact:true}).setInputFiles({name:'test.csv',mimeType:'text/csv',buffer:Buffer.from(file)});
  await preview.getByRole('button',{name:'Odczytaj CSV',exact:true}).click();
  await expect(preview.getByText(/Wiersze nie zostały jeszcze zweryfikowane/)).toBeVisible();
  await preview.getByRole('button',{name:'Dopasuj standardowe nazwy kolumn',exact:true}).click();
  await expect(preview.getByRole('heading',{name:'Podgląd: test.csv'})).toHaveCount(0);
  const checked=page.waitForResponse(r=>r.url().endsWith('/imports/csv-preview')&&r.request().method()==='POST');
  await preview.getByRole('button',{name:'Sprawdź mapowanie',exact:true}).click();
  const response=await checked;expect(response.status()).toBe(200);const data=csvPreviewSchema.parse(await response.json());
  expect(data.counts).toMatchObject({total:52,valid:51,invalid:1});expect(data.canCommit).toBe(false);
  await expect(preview.getByText(/Brak instrumentu o tym symbolu/).first()).toBeVisible();
  const detail=preview.getByText('Szczegóły wiersza 2',{exact:true});await detail.focus();await detail.press('Enter');
  await expect(preview.getByText('100.1234567890',{exact:true}).first()).toBeVisible();
  expect(await page.locator('#csv-test').count()).toBe(0);
  await expect(preview.getByText(formula,{exact:true}).first()).toBeVisible();await detail.press('Enter');
  await preview.getByRole('button',{name:'Następna strona',exact:true}).click();
  await expect(preview.locator('tbody tr')).toHaveCount(2);
  await preview.getByRole('button',{name:'Poprzednia strona',exact:true}).click();
  const settings=preview.getByRole('region',{name:'Plik i ustawienia CSV'});
  const result=preview.getByRole('region',{name:'Podgląd: test.csv'});
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:844});
    for(const theme of ['light','dark']){
      const toggle=page.getByRole('button',{name:theme==='dark'?'Włącz ciemny motyw':'Włącz jasny motyw'});if(await toggle.count())await toggle.click();
      await settings.screenshot({path:testInfo.outputPath(`csv-settings-${width}-${theme}.png`),animations:'disabled'});
      await result.screenshot({path:testInfo.outputPath(`csv-result-${width}-${theme}.png`),animations:'disabled'});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    }
  }
  await preview.getByRole('combobox',{name:'Separator dziesiętny',exact:true}).click();await page.getByRole('option',{name:'Kropka: 123.45',exact:true}).click();
  await expect(result).toHaveCount(0);
  await preview.getByRole('button',{name:'Sprawdź mapowanie',exact:true}).click();
  await expect(preview.getByText(/Niepoprawna liczba/).first()).toBeVisible();
  await preview.getByLabel('Plik CSV',{exact:true}).setInputFiles({name:'broken.csv',mimeType:'text/csv',buffer:Buffer.from('a;b\n"broken')});
  await expect(result).toHaveCount(0);await preview.getByRole('button',{name:'Odczytaj CSV',exact:true}).click();
  await expect(preview.getByRole('alert')).toContainText('Niezamknięty cudzysłów');
  // A late response from an earlier file must never repopulate the preview of a replacement file.
  let release:()=>void=()=>{};let started:()=>void=()=>{};
  const ready=new Promise<void>(resolve=>{started=resolve;});const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/v1/portfolios/*/imports/csv-preview',async route=>{
    const actual=await route.fetch();started();await gate;await route.fulfill({response:actual}).catch(()=>{});
  },{times:1});
  await preview.getByLabel('Plik CSV',{exact:true}).setInputFiles({name:'old.csv',mimeType:'text/csv',buffer:Buffer.from(file)});
  await preview.getByRole('button',{name:'Odczytaj CSV',exact:true}).click();await ready;
  await preview.getByLabel('Plik CSV',{exact:true}).setInputFiles({name:'replacement.csv',mimeType:'text/csv',buffer:Buffer.from('kind;occurredAt;currency;amount\nDEPOSIT;2026-01-01T12:00:00Z;PLN;10')});release();
  await expect(preview.getByRole('heading',{name:/Podgląd: old.csv/})).toHaveCount(0);
  await preview.getByRole('button',{name:'Odczytaj CSV',exact:true}).click();
  await expect(preview.getByRole('heading',{name:'Podgląd: replacement.csv'})).toBeVisible();
  expect(await (await page.request.get(`/api/v1/portfolios/${portfolio}/operations`)).json()).toEqual(before);
  await preview.getByRole('button',{name:'Wyczyść podgląd',exact:true}).click();
  await expect(preview.getByRole('heading',{name:'Podgląd: replacement.csv'})).toHaveCount(0);
  expect(await preview.getByLabel('Plik CSV',{exact:true}).inputValue()).toBe('');
});
