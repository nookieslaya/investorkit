import { expect, test } from '@playwright/test';
import { instrumentSchema, portfolioSchema, snapshotSchema, portfolioHistorySchema, cashSummarySchema } from '@investorkit/shared';
test('records real complete and incomplete valuations without rebuilding missing history', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(60000);
  const headers = { origin: baseURL! };
  const signup = await page.request.post('/api/auth/sign-up/email', { headers, data: { name: 'History tester', email: `history-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'Test-only-passphrase-2026!' } });
  expect(signup.status()).toBe(200);
  const portfolioResponse = await page.request.post('/api/v1/portfolios', { headers, data: { name: 'Historia testowa' } }); expect(portfolioResponse.status()).toBe(201);
  const portfolio = portfolioSchema.parse(await portfolioResponse.json());
  const instrumentResponse = await page.request.post('/api/v1/instruments', { headers, data: { type: 'ETF', symbol: 'IKH', mic: 'XNAS', name: 'Instrument historii', currency: 'USD', quantityScale: 3 } }); expect(instrumentResponse.status()).toBe(201);
  const instrument = instrumentSchema.parse(await instrumentResponse.json());
  const day = '2026-01-01T12:00:00Z';
  const common = { currency: 'USD', occurredAt: day, fxAsOf: day, fxToBase: '4', fxSource: 'manual', note: '' };
  expect((await page.request.post(`/api/v1/portfolios/${portfolio.id}/cash-operations`, { headers: { ...headers, 'idempotency-key': crypto.randomUUID() }, data: { ...common, kind: 'DEPOSIT', amount: '20' } })).status()).toBe(201);
  expect((await page.request.post(`/api/v1/portfolios/${portfolio.id}/operations`, { headers: { ...headers, 'idempotency-key': crypto.randomUUID() }, data: { ...common, kind: 'BUY', instrumentId: instrument.id, quantity: '0.125', unitPrice: '80', commission: '0.5', commissionCurrency: 'USD' } })).status()).toBe(201);
  await page.goto('/#investments');
  const history = page.getByRole('region', { name: 'Historia wartości portfela', exact: true });
  await expect(history.getByText('Nie masz zapisanych wycen w tym zakresie.', { exact: false })).toBeVisible();
  const save = history.getByRole('button', { name: 'Zapisz obecną wycenę', exact: true });
  const firstResponse = page.waitForResponse(response => response.url().endsWith(`/portfolios/${portfolio.id}/snapshots`) && response.request().method() === 'POST');
  await save.click(); const first = await firstResponse; expect(first.status()).toBe(201); const incomplete = snapshotSchema.parse(await first.json());
  expect(incomplete.complete).toBe(false);
  await expect(history.getByText('Niepełna w chwili zapisu', { exact: true })).toBeVisible();
  await expect(history.getByText(/Pełna wartość i wynik niedostępne/)).toBeVisible();
  expect((await page.request.post('/api/v1/fx-rates', { headers, data: { currency: 'USD', baseCurrency: 'PLN', rate: '4.2', asOf: new Date().toISOString(), source: 'manual' } })).status()).toBe(201);
  expect((await page.request.post(`/api/v1/instruments/${instrument.id}/quotes`, { headers, data: { currency: 'USD', price: '90', asOf: new Date().toISOString(), source: 'manual' } })).status()).toBe(201);
  const secondResponse = page.waitForResponse(response => response.url().endsWith(`/portfolios/${portfolio.id}/snapshots`) && response.request().method() === 'POST');
  await save.click(); const second = await secondResponse; expect(second.status()).toBe(201); const complete = snapshotSchema.parse(await second.json());
  expect(complete.valueBase).toBe('87.15'); expect(complete.pnl).toBe('7.15');
  const completeCard = history.getByRole('article').filter({ has: page.getByText('Kompletna w chwili zapisu', { exact: true }) });
  const incompleteCard = history.getByRole('article').filter({ has: page.getByText('Niepełna w chwili zapisu', { exact: true }) });
  await expect(history.getByRole('article')).toHaveCount(2); await expect(completeCard).toContainText('87,15 PLN');
  const details = completeCard.getByText('Szczegóły zapisanej wyceny', { exact: true });
  await details.focus(); await details.press('Enter');
  await expect(completeCard).toContainText('Cena: 90,00 USD'); await expect(completeCard).toContainText('4.200000000000 PLN/USD');
  await details.press('Space'); await expect(completeCard.getByText('IKH · Instrument historii', { exact: true })).toBeHidden();
  const missingDetails = incompleteCard.getByText('Szczegóły zapisanej wyceny', { exact: true });
  await missingDetails.click(); await expect(incompleteCard).toContainText('brak ceny, brak kursu'); await missingDetails.click();
  // Later data and backdated ledger entries must never rewrite previously captured values.
  expect((await page.request.post('/api/v1/fx-rates', { headers, data: { currency: 'USD', baseCurrency: 'PLN', rate: '5', asOf: new Date().toISOString(), source: 'manual' } })).status()).toBe(201);
  expect((await page.request.post(`/api/v1/instruments/${instrument.id}/quotes`, { headers, data: { currency: 'USD', price: '100', asOf: new Date().toISOString(), source: 'manual' } })).status()).toBe(201);
  expect((await page.request.post(`/api/v1/portfolios/${portfolio.id}/cash-operations`, { headers: { ...headers, 'idempotency-key': crypto.randomUUID() }, data: { ...common, currency: 'PLN', fxToBase: '1', kind: 'DEPOSIT', amount: '100' } })).status()).toBe(201);
  await page.reload(); await expect(completeCard).toContainText('87,15 PLN'); await expect(history.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('article').filter({ hasText: 'Wartość portfela' }).first()).toContainText('210,00');
  await details.click(); await expect(completeCard).toContainText('Cena: 90,00 USD'); await details.click();
  const gaps = history.getByText(/^Dni bez rzeczywistej zapisanej wyceny:/);
  await gaps.focus(); await gaps.press('Enter'); await expect(history.getByText('Daty według czasu polskiego.', { exact: false })).toBeVisible(); await gaps.press('Space');
  await history.getByRole('combobox', { name: 'Zakres historii', exact: true }).click();
  await page.getByRole('option', { name: 'Własny zakres', exact: true }).click();
  await history.getByLabel('Od dnia', { exact: true }).fill('2025-01-01');
  await history.getByLabel('Do dnia', { exact: true }).fill('2025-01-02');
  await history.getByRole('button', { name: 'Pokaż wybrany zakres', exact: true }).click();
  await expect(history.getByRole('article')).toHaveCount(0);
  await expect(history.getByText('Nie masz zapisanych wycen w tym zakresie.', { exact: false })).toBeVisible();
  await history.getByRole('combobox', { name: 'Zakres historii', exact: true }).click();
  await page.getByRole('option', { name: 'Ostatnie 7 dni', exact: true }).click();
  await expect(history.getByRole('article')).toHaveCount(2);
  await history.getByRole('button', { name: 'Odśwież historię', exact: true }).click();
  await expect(history.getByRole('article')).toHaveCount(2);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['light', 'dark']) {
      const toggle = page.getByRole('button', { name: theme === 'dark' ? 'Włącz ciemny motyw' : 'Włącz jasny motyw' });
      if (await toggle.count()) await toggle.click();
      await history.screenshot({ path: testInfo.outputPath(`history-${width}-${theme}.png`), animations: 'disabled' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
  const anonymous = await browser.newContext();
  try { expect((await anonymous.request.get(`${baseURL}/api/v1/valuation-snapshots/${complete.id}`)).status()).toBe(401); } finally { await anonymous.close(); }
  const stored = snapshotSchema.parse(await (await page.request.get(`/api/v1/valuation-snapshots/${complete.id}`)).json()); expect(stored).toEqual(complete);
  const list = portfolioHistorySchema.parse(await (await page.request.get(`/api/v1/portfolios/${portfolio.id}/history`)).json()); expect(list.items).toHaveLength(2);
  const demoDate = new Date(Date.parse(complete.asOf) - 2 * 86400000).toISOString();
  const demo = snapshotSchema.parse({ ...complete, id: crypto.randomUUID(), demo: true, asOf: demoDate, valuation: { ...complete.valuation, asOf: demoDate } });
  await page.route('**/api/v1/portfolios/*/history?*', async route => {
    const response = await route.fetch();
    const current = portfolioHistorySchema.parse(await response.json());
    const items = [...current.items, demo].sort((left, right) => Date.parse(left.asOf) - Date.parse(right.asOf) || left.id.localeCompare(right.id));
    await route.fulfill({ response, json: portfolioHistorySchema.parse({ ...current, items }) });
  });
  await page.route(`**/api/v1/valuation-snapshots/${demo.id}`, route => route.fulfill({ json: demo }));
  await history.getByRole('button', { name: 'Odśwież historię', exact: true }).click();
  await expect(history.getByText(/DEMO — widoczne są fikcyjne wyceny/)).toBeVisible();
  const demoCard = history.getByRole('article').filter({ has: page.getByText('Kompletne dane demonstracyjne', { exact: true }) });
  await expect(demoCard).toContainText('DEMO');
  await demoCard.getByText('Szczegóły zapisanej wyceny', { exact: true }).click();
  await expect(demoCard).toContainText('daty, kwoty, ceny i pozostałe dane tego przykładu są fikcyjne');
  await expect(demoCard).toContainText('założenie DEMO');
  await demoCard.getByText('Szczegóły zapisanej wyceny', { exact: true }).click();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['light', 'dark']) {
      const toggle = page.getByRole('button', { name: theme === 'dark' ? 'Włącz ciemny motyw' : 'Włącz jasny motyw' });
      if (await toggle.count()) await toggle.click();
      await history.screenshot({ path: testInfo.outputPath(`history-demo-${width}-${theme}.png`), animations: 'disabled' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
  const cash = cashSummarySchema.parse(await (await page.request.get(`/api/v1/portfolios/${portfolio.id}/cash`)).json()); expect(cash.operationCount).toBe(3);
});
