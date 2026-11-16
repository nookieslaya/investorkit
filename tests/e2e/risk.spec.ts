import { expect, test } from '@playwright/test';
import { analyzeRisk, stressPortfolio } from '@investorkit/portfolio-engine';
import type { RiskSettings } from '@investorkit/shared';
import { DEFAULT_RISK_SETTINGS, riskSchema, riskSettingsInputSchema, stressInputSchema, stressSchema } from '@investorkit/shared';
test('presents concentration, stress scopes, settings and incomplete data on desktop/mobile in both themes', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(60000);
  // Arithmetic/ownership/storage are exercised against PostgreSQL in risk-api.test.ts.
  // Here validated fixtures isolate presentation and avoid consuming the shared API rate limit.
  const ids = ['22e5e45b-1bdb-4a92-8298-8a44cc6c6dd1', '22e5e45b-1bdb-4a92-8298-8a44cc6c6dd2', '22e5e45b-1bdb-4a92-8298-8a44cc6c6dd3'];
  const asOf = new Date().toISOString();
  const old = new Date(Date.now() - 2 * 3600000).toISOString();
  const common = { fxToBase: '1', fxAsOf: old, occurredAt: old, fxSource: 'manual', note: '' };
  const values = ['600', '300', '100'];
  const context = { instruments: ids.map(instrumentId => ({ instrumentId, currency: 'PLN', quantityScale: 0 })),
    operations: [{ ...common, kind: 'DEPOSIT', currency: 'PLN', amount: '1100' }, ...ids.map((instrumentId, i) => ({ ...common, kind: 'BUY', instrumentId, quantity: '1', unitPrice: values[i]!, commission: '0', currency: 'PLN', commissionCurrency: 'PLN' }))],
    quotes: ids.map((instrumentId, i) => ({ instrumentId, currency: 'PLN' as const, price: values[i]!, asOf: old, source: 'manual' as const })), fxRates: [], asOf };
  const metadata = ids.map((instrumentId, i) => ({ instrumentId, type: i === 2 ? 'ETF' : 'STOCK', issuerCountry: i === 2 ? null : 'PL' }));
  let settings: RiskSettings = { ...DEFAULT_RISK_SETTINGS, revision: 0 };
  const names = (id: string) => ({ name: `Instrument ${ids.indexOf(id) + 1}`, symbol: `RISK${ids.indexOf(id) + 1}` });
  const hydrate = (value: ReturnType<typeof stressPortfolio>['before']) => ({ ...value, positions: value.positions.map(row => ({ ...row, ...names(row.instrumentId) })) });
  await page.route('**/api/v1/portfolios/*/risk', async route => {
    const result = analyzeRisk(context, metadata, riskSettingsInputSchema.parse({ maxPositionPct: settings.maxPositionPct, top3Pct: settings.top3Pct, top5Pct: settings.top5Pct, quoteMaxAgeHours: settings.quoteMaxAgeHours, fxMaxAgeHours: settings.fxMaxAgeHours }));
    await route.fulfill({ json: riskSchema.parse({ ...result, valuation: hydrate(result.valuation), settings }) });
  });
  await page.route('**/api/v1/portfolios/*/stress-tests', async route => {
    const input = stressInputSchema.parse(route.request().postDataJSON());
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
  expect((await page.request.post('/api/v1/portfolios', { headers, data: { name: 'Koncentracja UI' } })).ok()).toBe(true);
  await page.goto('/#risk');
  const screen = page.getByRole('region', { name: 'Koncentracja i scenariusze', exact: true });
  const metrics = page.getByLabel('Koncentracja portfela');
  await expect(metrics).toContainText('54,55%'); await expect(metrics).toContainText('90,91%');
  await expect(metrics.getByText('Przekroczony Twój próg', { exact: true })).toHaveCount(3);
  await page.getByLabel('Spadek ceny (%)', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'Oblicz scenariusz', exact: true }).click();
  const result = page.getByRole('region', { name: 'Wynik scenariusza', exact: true });
  await expect(result).toContainText('600,00 PLN'); await expect(result).toContainText('500,00 PLN'); await expect(result).toContainText('45,45%');
  await page.getByRole('combobox', { name: 'Zakres spadku', exact: true }).click();
  await page.getByRole('option', { name: 'Jedna pozycja', exact: true }).click();
  await expect(result).toHaveCount(0);
  await page.getByRole('button', { name: 'Oblicz scenariusz', exact: true }).click();
  await expect(result).toContainText('800,00 PLN'); await expect(result).toContainText('300,00 PLN');
  const country = page.getByText('Kraj emitenta / funduszu', { exact: true });
  await country.focus(); await country.press('Enter');
  await expect(page.getByText('Nieznany kraj emitenta', { exact: true })).toBeVisible();
  await expect(page.getByText('Kraj emitenta ETF nie jest ekspozycją geograficzną', { exact: false })).toBeVisible();
  await screen.screenshot({ path: testInfo.outputPath('risk-desktop-light.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Włącz ciemny motyw' }).click();
  await screen.screenshot({ path: testInfo.outputPath('risk-desktop-dark.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await screen.screenshot({ path: testInfo.outputPath('risk-mobile-dark.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Włącz jasny motyw' }).click();
  await screen.screenshot({ path: testInfo.outputPath('risk-mobile-light.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const editor = page.getByText('Ustawienia progów i świeżości', { exact: true });
  await editor.focus(); await editor.press('Enter');
  await page.getByLabel('Próg jednej pozycji (%)', { exact: true }).fill('60');
  await page.getByLabel('Próg Top 3 (%)', { exact: true }).fill('100');
  await page.getByLabel('Próg Top 5 (%)', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Zapisz ustawienia', exact: true }).click();
  await expect(page.getByText('Ustawienia zapisane.', { exact: false })).toBeVisible();
  await expect(metrics.getByText('Próg nieprzekroczony', { exact: true })).toHaveCount(3);
  await page.getByLabel('Próg jednej pozycji (%)', { exact: true }).fill('65');
  await page.getByRole('button', { name: 'Wczytaj aktualne ustawienia', exact: true }).click();
  await expect(page.getByLabel('Próg jednej pozycji (%)', { exact: true })).toHaveValue('60');
  await page.getByLabel('Maksymalny wiek ceny (h)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Zapisz ustawienia', exact: true }).click();
  await expect(page.getByText('Wycena niepełna', { exact: true })).toBeVisible();
  await expect(metrics).toContainText('—');
  await page.getByRole('button', { name: 'Oblicz scenariusz', exact: true }).click();
  await expect(result).toContainText('— PLN');
  await page.reload();
  await expect(page.getByText('Wycena niepełna', { exact: true })).toBeVisible();
});
