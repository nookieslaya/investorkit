import { expect, test } from '@playwright/test';
import { marketSearchSchema, marketStateSchema, marketStatesSchema } from '@investorkit/shared';
test('selects an exact EOD listing, preserves manual sources and debounces search (provider UI fixtures)', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(60000);
  const headers = { origin: baseURL! };
  const signup = await page.request.post('/api/auth/sign-up/email', { headers, data: { name: 'Market tester', email: `market-e2e-${Date.now()}@example.com`, password: 'Test-only-passphrase-2026!' } });
  expect(signup.status()).toBe(200);
  expect((await page.request.post('/api/v1/portfolios', { headers, data: { name: 'Market test' } })).status()).toBe(201);
  const selectionId = crypto.randomUUID(); const asOf = new Date(Date.now() - 86400000).toISOString();
  const results = marketSearchSchema.parse({ items: [{ id: selectionId, symbol: 'PKO.WA', name: 'Powszechna Kasa Bank Polski', mic: 'XWAR', currency: 'PLN', type: null, hasEod: true }], partial: false, cached: false });
  const states = marketStatesSchema.parse({ enabled: true, used: 2, limit: 60, items: [] });
  let searches = 0; let refreshes = 0;
  await page.route('**/api/v1/market', route => route.fulfill({ json: marketStatesSchema.parse(states) }));
  await page.route('**/api/v1/market/search', async route => {
    searches++; expect(route.request().postDataJSON()).toEqual({ query: 'PKO', mic: 'XWAR' });
    await route.fulfill({ json: results });
  });
  await page.route('**/api/v1/instruments/*/market-binding', async route => {
    const instrumentId = route.request().url().split('/').at(-2)!;
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ selectionId });
      states.items = [marketStateSchema.parse({ instrumentId, symbol: 'PKO.WA', mic: 'XWAR', currency: 'PLN', mode: 'marketstack', lastAttemptAt: new Date().toISOString(), status: 'ok', quote: { price: '100.12', sessionDate: asOf.slice(0,10), asOf, fetchedAt: new Date().toISOString() } })];
    } else states.items[0]!.mode = route.request().postDataJSON().mode;
    await route.fulfill({ json: states.items[0] });
  });
  await page.route('**/api/v1/instruments/*/market-refresh', async route => { refreshes++; await route.fulfill({ json: states.items[0] }); });
  await page.goto('/#investments');
  const panel = page.getByRole('region', { name: 'Ceny dzienne · Marketstack', exact: true });
  await page.getByRole('navigation', { name: 'Sekcje portfela' }).getByRole('link', { name: 'Operacje', exact: true }).click();
  await page.getByRole('navigation', { name: 'Sekcje portfela' }).getByRole('link', { name: 'Ceny dzienne', exact: true }).click();
  await expect(panel).toBeInViewport();
  await page.reload();
  await expect(panel).toBeInViewport();
  const editor = page.getByRole('region', { name: 'Uzupełnij swój portfel', exact: true });
  await panel.getByRole('link', { name: 'Uzupełnij swój portfel → Instrument', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Instrument', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(editor.getByRole('heading', { name: 'Wyszukaj instrument w Marketstack' })).toBeVisible();
  await expect(panel.getByLabel('Nazwa lub ticker (minimum 3 znaki)')).toHaveCount(0);
  const manual = editor.getByText('Dodaj instrument ręcznie', { exact: true });
  await manual.focus(); await manual.press('Enter');
  await expect(editor.getByLabel('Symbol (ticker)', { exact: true })).toBeVisible();
  await manual.press('Enter');
  const input = editor.getByLabel('Nazwa lub ticker (minimum 3 znaki)');
  await input.fill('PK'); await page.waitForTimeout(750); expect(searches).toBe(0);
  await input.fill('PKO');
  const result = editor.getByRole('button', { name: /Powszechna Kasa Bank Polski/ });
  await expect(result).toBeVisible(); expect(searches).toBe(1);
  await result.focus(); await result.press('Enter');
  const selection = editor.getByRole('form', { name: 'Wybór instrumentu Marketstack' });
  await expect(selection.getByLabel('Nazwa instrumentu', { exact: true })).toHaveValue('Powszechna Kasa Bank Polski');
  await selection.getByRole('combobox', { name: 'Typ instrumentu (potwierdź)' }).click();
  await page.getByRole('option', { name: 'Akcja', exact: true }).click();
  await selection.getByRole('button', { name: 'Dodaj instrument z Marketstack', exact: true }).click();
  await expect(panel.getByText(/Cena zamknięcia z/)).toContainText(asOf.slice(0,10));
  await expect(panel.getByText(/Źródło wyceny:/)).toHaveText('Źródło wyceny: Marketstack EOD.');
  await panel.getByRole('button', { name: 'Użyj cen ręcznych', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Odśwież EOD', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: 'Użyj Marketstack', exact: true }).click();
  await panel.getByRole('button', { name: 'Odśwież EOD', exact: true }).click();
  expect(refreshes).toBe(1); await expect(panel.getByText(/Cena zamknięcia z/)).toContainText(asOf.slice(0,10));
  await result.click();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['light', 'dark']) {
      const toggle = page.getByRole('button', { name: theme === 'dark' ? 'Włącz ciemny motyw' : 'Włącz jasny motyw' });
      if (await toggle.count()) await toggle.click();
      await editor.screenshot({ path: testInfo.outputPath(`instrument-picker-${width}-${theme}.png`), animations: 'disabled' });
      await panel.screenshot({ path: testInfo.outputPath(`market-${width}-${theme}.png`), animations: 'disabled' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});
