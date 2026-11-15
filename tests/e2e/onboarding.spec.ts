import { test, expect } from '@playwright/test';
test('registers, persists a private portfolio and signs out', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Imię', { exact: true }).fill('Tester');
  await page.getByLabel('Adres email').fill(`e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`);
  await page.getByLabel('Hasło', { exact: true }).fill('Test-only-passphrase-2026!');
  await page.getByRole('button', { name: 'Utwórz konto', exact: true }).click();
  await page.getByLabel('Nazwa portfela').fill('Portfel testowy');
  await page.getByRole('button', { name: 'Utwórz portfel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Portfel testowy' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Portfel testowy' })).toBeVisible();
  await page.getByRole('button', { name: 'Wyloguj' }).click();
  await expect(page.getByRole('heading', { name: 'Zacznij swój portfel' })).toBeVisible();
});
