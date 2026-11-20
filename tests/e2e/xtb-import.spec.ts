import { expect, test } from '@playwright/test';
import { xtbPreviewSchema } from '@investorkit/shared';
import { readFileSync } from 'node:fs';
const example=new URL('../../apps/web/public/examples/xtb-demo.xlsx',import.meta.url);
test('opens the documented XTB XLSX layout through the real API, clears stale results and never writes the ledger',async({page,baseURL},info)=>{
  test.setTimeout(90000);
  const headers={origin:baseURL!};
  expect((await page.request.post('/api/auth/sign-up/email',{headers,data:{name:'XLSX tester',email:`xtb-e2e-${Date.now()}@example.com`,password:'Test-only-passphrase-2026!'}})).status()).toBe(200);
  const created=await page.request.post('/api/v1/portfolios',{headers,data:{name:'XLSX preview'}});expect(created.status()).toBe(201);
  const portfolio=(await created.json()).id as string;
  const before=await (await page.request.get(`/api/v1/portfolios/${portfolio}/operations`)).json();
  await page.goto('/#imports');await page.getByRole('button',{name:'XTB XLSX — podgląd',exact:true}).click();
  const panel=page.getByRole('region',{name:'Podgląd XTB XLSX',exact:true});
  const download=await page.request.get('/examples/xtb-demo.xlsx');expect(download.status()).toBe(200);expect(await download.body()).toEqual(readFileSync(example));
  await panel.getByLabel('Plik XLSX',{exact:true}).setInputFiles({name:'example.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:readFileSync(example)});
  const read=panel.getByRole('button',{name:'Odczytaj raport XTB',exact:true});await expect(read).toBeDisabled();
  await panel.getByRole('checkbox').check();
  const response=page.waitForResponse(response=>response.url().endsWith('/imports/xtb-preview')&&response.request().method()==='POST');
  await read.click();const actual=await response;expect(actual.status()).toBe(200);expect(xtbPreviewSchema.parse(await actual.json()).counts.openLots).toBe(3);
  const result=panel.getByRole('region',{name:'Podgląd: example.xlsx'});await expect(result).toBeVisible();await expect(result.getByRole('status')).toContainText('Wiersze z uwagami: 0');
  await expect(result.locator('tbody tr')).toHaveCount(8);
  await result.getByRole('combobox',{name:'Arkusz raportu',exact:true}).click();await page.getByRole('option',{name:'Otwarte partie (5 wierszy)',exact:true}).click();
  await expect(result.locator('tbody tr')).toHaveCount(5);await expect(result.getByText('Grupa — nie dodatkowa pozycja',{exact:true})).toHaveCount(2);
  const details=result.getByText('Źródło i szczegóły odczytu',{exact:true});await details.focus();await details.press('Enter');await expect(result.getByText('10000001 · waluta potwierdzona: PLN',{exact:true})).toBeVisible();
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:844});
    for(const theme of ['light','dark']){
      const toggle=page.getByRole('button',{name:theme==='dark'?'Włącz ciemny motyw':'Włącz jasny motyw'});if(await toggle.count())await toggle.click();
      await panel.getByRole('region',{name:'Plik i ustawienia XTB'}).screenshot({path:info.outputPath(`xtb-settings-${width}-${theme}.png`),animations:'disabled'});
      await result.screenshot({path:info.outputPath(`xtb-result-${width}-${theme}.png`),animations:'disabled'});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    }
  }
  await panel.getByRole('combobox',{name:'Waluta rachunku z raportu',exact:true}).click();await page.getByRole('option',{name:'USD',exact:true}).click();
  await expect(result).toHaveCount(0);await expect(panel.getByRole('checkbox')).not.toBeChecked();await expect(read).toBeDisabled();
  // The previous file must not reappear after replacing it during an in-flight request.
  let release:()=>void=()=>{},started:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{started=resolve;});
  await page.route('**/api/v1/portfolios/*/imports/xtb-preview',async route=>{const actual=await route.fetch();started();await gate;await route.fulfill({response:actual}).catch(()=>{});},{times:1});
  await panel.getByRole('checkbox').check();await read.click();await ready;
  await panel.getByLabel('Plik XLSX',{exact:true}).setInputFiles({name:'broken.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('not an archive')});release();
  await expect(result).toHaveCount(0);await panel.getByRole('checkbox').check();await read.click();await expect(panel.getByRole('alert')).toContainText('kontener XLSX');
  await panel.getByRole('button',{name:'Wyczyść podgląd',exact:true}).click();expect(await panel.getByLabel('Plik XLSX',{exact:true}).inputValue()).toBe('');
  expect(await (await page.request.get(`/api/v1/portfolios/${portfolio}/operations`)).json()).toEqual(before);
  await page.getByRole('button',{name:'Ogólny CSV',exact:true}).click();await expect(page.getByRole('region',{name:'Podgląd CSV',exact:true})).toBeVisible();
});
