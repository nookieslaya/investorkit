import { expect, test } from '@playwright/test';
import { analyzeRisk, stressPortfolio } from '@investorkit/portfolio-engine';
import type { Currency, RiskSettings } from '@investorkit/shared';
import { DEFAULT_RISK_SETTINGS, riskSchema, riskSettingsInputSchema, stressInputSchema, stressSchema } from '@investorkit/shared';
test('explains portfolio drops, preserves scope and invalidates outdated results on desktop/mobile', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(60000);
  // Validated fixtures isolate presentation; real DB ownership/readonly checks remain in risk-api.test.ts.
  const asOf = new Date().toISOString();
  const old = new Date(Date.now() - 2 * 3600000).toISOString();
  const positions = [
    { currency: 'PLN', quantity: '40', price: '100', fee: '5', fx: '1', symbol: 'DEMO-PL-A', type: 'STOCK', issuerCountry: 'PL' },
    { currency: 'USD', quantity: '5', price: '100', fee: '2', fx: '4', symbol: 'DEMO-US-A', type: 'STOCK', issuerCountry: 'US' },
    { currency: 'EUR', quantity: '5', price: '80', fee: '2', fx: '4.5', symbol: 'DEMO-EU-A', type: 'STOCK', issuerCountry: 'DE' },
    { currency: 'PLN', quantity: '5', price: '240', fee: '2', fx: '1', symbol: 'DEMO-ETF-PL', type: 'ETF', issuerCountry: 'PL' },
    { currency: 'EUR', quantity: '2', price: '100', fee: '1', fx: '4.5', symbol: 'DEMO-ETF-EU', type: 'ETF', issuerCountry: 'IE' },
    { currency: 'USD', quantity: '1.5', price: '100', fee: '0.5', fx: '4', symbol: 'DEMO-ETF-US', type: 'ETF', issuerCountry: null },
  ].map((row, index) => ({ ...row, currency: row.currency as Currency, instrumentId: `22e5e45b-1bdb-4a92-8298-8a44cc6c6dd${index + 1}` }));
  const common = { fxAsOf: old, occurredAt: old, fxSource: 'manual', note: '' };
  const context = { instruments: positions.map(row => ({ instrumentId: row.instrumentId, currency: row.currency, quantityScale: 4 })), operations: [
    ...[{ currency: 'PLN', amount: '5580', fx: '1' }, { currency: 'USD', amount: '750', fx: '4' }, { currency: 'EUR', amount: '700', fx: '4.5' }].map(row => ({ ...common, kind: 'DEPOSIT', currency: row.currency, amount: row.amount, fxToBase: row.fx })),
    ...positions.map(row => ({ ...common, kind: 'BUY', instrumentId: row.instrumentId, quantity: row.quantity, unitPrice: row.price, commission: row.fee, currency: row.currency, commissionCurrency: row.currency, fxToBase: row.fx })),
  ], quotes: positions.map(row => ({ instrumentId: row.instrumentId, currency: row.currency, price: row.price, asOf: old, source: 'manual' as const })),
    fxRates: [{ currency: 'USD' as const, rate: '4' }, { currency: 'EUR' as const, rate: '4.5' }].map(row => ({ ...row, baseCurrency: 'PLN' as const, asOf: old, source: 'manual' as const })), asOf };
  const metadata = positions.map(row => ({ instrumentId: row.instrumentId, type: row.type, issuerCountry: row.issuerCountry }));
  let settings: RiskSettings = { ...DEFAULT_RISK_SETTINGS, revision: 0 };
  const names = (id: string) => ({ name: `[DEMO] ${positions.find(row => row.instrumentId === id)!.symbol}`, symbol: positions.find(row => row.instrumentId === id)!.symbol });
  const hydrate = (value: ReturnType<typeof stressPortfolio>['before']) => ({ ...value, positions: value.positions.map(row => ({ ...row, ...names(row.instrumentId) })) });
  let riskReads = 0;
  await page.route('**/api/v1/portfolios/*/risk', async route => {
    riskReads += 1;
    const { revision: _revision, ...limits } = settings;
    const result = analyzeRisk(context, metadata, limits);
    await route.fulfill({ json: riskSchema.parse({ ...result, valuation: hydrate(result.valuation), settings }) });
  });
  let holdNextStress = false;
  let releaseStress: (() => void) | undefined;
  await page.route('**/api/v1/portfolios/*/stress-tests', async route => {
    const input = stressInputSchema.parse(route.request().postDataJSON());
    if (holdNextStress) { holdNextStress = false; await new Promise<void>(resolve => { releaseStress = resolve; }); }
    const result = stressPortfolio({ ...context, quoteMaxAgeHours: settings.quoteMaxAgeHours, fxMaxAgeHours: settings.fxMaxAgeHours }, input);
    await route.fulfill({ json: stressSchema.parse({ ...result, before: hydrate(result.before), after: { ...result.after, positions: result.after.positions.map(row => ({ ...row, ...names(row.instrumentId) })) } }) });
  });
  await page.route('**/api/v1/portfolios/*/risk-settings', async route => {
    expect(route.request().headers()['if-match']).toBe(`"${settings.revision}"`);
    settings = { ...riskSettingsInputSchema.parse(route.request().postDataJSON()), revision: settings.revision + 1 };
    await route.fulfill({ json: settings });
  });
  const headers = { origin: new URL(baseURL!).origin };
  expect((await page.request.post('/api/auth/sign-up/email', { headers, data: { name: 'Risk', email: `risk-ui-${Date.now()}@example.com`, password: 'Test-only-passphrase-2026!' } })).ok()).toBe(true);
  expect((await page.request.post('/api/v1/portfolios', { headers, data: { name: 'Scenariusze UI' } })).ok()).toBe(true);
  await page.clock.install();
  await page.goto('/#risk');
  const screen = page.getByRole('region', { name: 'Koncentracja i scenariusze', exact: true });
  const tabs = page.getByRole('navigation', { name: 'Sekcje portfela' });
  await expect(tabs.getByRole('link', { name: 'Symulacja zakupu', exact: true })).toHaveAttribute('href', '#simulator');
  await expect(tabs.getByRole('link', { name: 'Scenariusze spadków', exact: true })).toHaveAttribute('href', '#risk');
  const metrics = page.getByLabel('Koncentracja portfela');
  await expect(metrics).toContainText('34,19%'); await expect(metrics).toContainText('66,67%');
  const presets = page.getByRole('group', { name: 'Szybki wybór spadku' });
  const drop = page.getByLabel('Wielkość spadku (%)', { exact: true });
  const calculate = page.getByRole('button', { name: 'Oblicz scenariusz', exact: true });
  const result = page.getByRole('region', { name: 'Wynik scenariusza', exact: true });
  await expect(presets.getByRole('button', { name: '20%', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await presets.getByRole('button', { name: '40%', exact: true }).click();
  await expect(drop).toHaveValue('40'); await calculate.click();
  await expect(result.locator('.stress-summary')).toContainText('Spadek cen wszystkich papierów o 40%');
  await expect(result).toContainText('7 499,50 PLN'); await expect(result).toContainText('−4 200,00 PLN');
  await expect(result.getByLabel('Porównanie wybranej pozycji')).toHaveCount(0);
  await expect(result.getByText('DEMO-ETF-US', { exact: true })).toBeHidden();
  await page.getByRole('combobox', { name: 'Zakres spadku', exact: true }).click();
  await page.getByRole('option', { name: 'Jedna pozycja', exact: true }).click();
  await expect(result).toHaveCount(0);
  const position = page.getByRole('combobox', { name: 'Pozycja do testu', exact: true });
  await position.click(); await page.getByRole('option', { name: 'DEMO-ETF-US · [DEMO] DEMO-ETF-US', exact: true }).click();
  await calculate.click();
  await expect(result.locator('.stress-summary')).toHaveText('Spadek DEMO-ETF-US o 40% obniżyłby wartość Twojego portfela o 240,00 PLN, czyli 2,05%.');
  const comparison = result.getByRole('region', { name: 'Porównanie wybranej pozycji', exact: true });
  await expect(comparison).toContainText('100,00 → 60,00'); await expect(comparison).toContainText('600,00 → 360,00');
  await expect(comparison).toContainText('5,13% → 3,14%');
  await expect(result).toContainText('11 699,50 PLN'); await expect(result).toContainText('11 459,50 PLN');
  await expect(result).toContainText('−240,00 PLN / −2,05%');
  await expect(result.getByText('DEMO-PL-A · [DEMO] DEMO-PL-A', { exact: true })).toBeHidden();
  const details = result.getByText('Szczegóły obliczeń', { exact: true });
  await details.focus(); await details.press('Enter');
  await expect(result.getByText('DEMO-PL-A · [DEMO] DEMO-PL-A', { exact: true })).toBeVisible();
  await expect(result.getByText('FX: 4,00 PLN/USD', { exact: false }).last()).toBeVisible();
  await details.press('Space');
  const settingsPanel = page.getByText('Ustawienia progów i świeżości', { exact: true });
  await expect(page.getByLabel('Próg jednej pozycji (%)', { exact: true })).toBeHidden();
  const country = page.getByText('Kraj emitenta / funduszu', { exact: true });
  await country.focus(); await country.press('Enter');
  await expect(page.getByText('Nieznany kraj emitenta', { exact: true })).toBeVisible();
  await screen.screenshot({ path: testInfo.outputPath('risk-desktop-light.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Włącz ciemny motyw' }).click();
  await screen.screenshot({ path: testInfo.outputPath('risk-desktop-dark.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await screen.screenshot({ path: testInfo.outputPath('risk-mobile-dark.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Włącz jasny motyw' }).click();
  await screen.screenshot({ path: testInfo.outputPath('risk-mobile-light.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // All parameter changes remove the previous result, including delayed network responses.
  await presets.getByRole('button', { name: '10%', exact: true }).click(); await expect(result).toHaveCount(0);
  await presets.getByRole('button', { name: '20%', exact: true }).click(); await calculate.click();
  await drop.fill('0'); await expect(result).toHaveCount(0); await calculate.click();
  await expect(result.locator('.stress-summary')).toContainText('nie zmieniłby wartości Twojego portfela');
  await expect(result).toContainText('0,00 PLN / 0,00%'); await expect(result).not.toContainText('−0,00');
  await drop.fill('100'); await calculate.click();
  await expect(comparison).toContainText('600,00 → 0,00'); await expect(result).toContainText('−600,00 PLN');
  await drop.fill('40'); await calculate.click();
  await position.click(); await page.getByRole('option', { name: 'DEMO-PL-A · [DEMO] DEMO-PL-A', exact: true }).click();
  await expect(result).toHaveCount(0); await calculate.click();
  // Identical payload refetch and real data changes both invalidate the snapshot.
  const beforeRefresh = riskReads;
  await page.clock.runFor(61000); await expect.poll(() => riskReads).toBeGreaterThan(beforeRefresh);
  await expect(result).toHaveCount(0); await expect(drop).toHaveValue('40');
  await calculate.click();
  await page.getByRole('button', { name: 'Odśwież dane', exact: true }).click(); await expect(result).toHaveCount(0);
  await calculate.click();
  context.quotes[0]!.price = '110';
  await page.clock.runFor(61000); await expect(metrics).not.toContainText('34,19%'); await expect(result).toHaveCount(0);
  await calculate.click();
  await presets.getByRole('button', { name: '20%', exact: true }).click();
  holdNextStress = true;
  await calculate.click(); await expect.poll(() => typeof releaseStress).toBe('function');
  await page.getByRole('button', { name: 'Odśwież dane', exact: true }).click();
  const lateResponse = page.waitForResponse(response => response.url().endsWith('/stress-tests'));
  releaseStress!(); await lateResponse; await expect(result).toHaveCount(0);
  // Settings stay collapsed until requested, and a stale FX cannot turn into a full result.
  await settingsPanel.focus(); await settingsPanel.press('Enter');
  await page.getByLabel('Próg jednej pozycji (%)', { exact: true }).fill('60');
  await page.getByLabel('Próg Top 3 (%)', { exact: true }).fill('100');
  await page.getByLabel('Próg Top 5 (%)', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Zapisz ustawienia', exact: true }).click();
  await expect(page.getByText('Ustawienia zapisane.', { exact: false })).toBeVisible();
  await expect(metrics.getByText('Próg nieprzekroczony', { exact: true })).toHaveCount(3);
  await page.getByLabel('Próg jednej pozycji (%)', { exact: true }).fill('65');
  await page.getByRole('button', { name: 'Wczytaj aktualne ustawienia', exact: true }).click();
  await expect(page.getByLabel('Próg jednej pozycji (%)', { exact: true })).toHaveValue('60');
  await page.getByLabel('Maksymalny wiek FX (h)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Zapisz ustawienia', exact: true }).click();
  await expect(page.getByText('Wycena niepełna', { exact: true })).toBeVisible();
  await calculate.click(); await expect(result).toContainText('pełny wpływ na portfel jest niedostępny');
  await expect(result).toContainText('— PLN / —');
  await page.getByLabel('Maksymalny wiek ceny (h)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Zapisz ustawienia', exact: true }).click();
  await expect(result).toHaveCount(0); await calculate.click();
  await expect(result).toContainText('— PLN / —');
  await page.reload(); await expect(page.getByText('Wycena niepełna', { exact: true })).toBeVisible();
});
