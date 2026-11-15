import { defineConfig, devices } from '@playwright/test';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required for E2E; use a migrated disposable database.');
const webPort = process.env.E2E_WEB_PORT ?? '5173';
const apiPort = process.env.E2E_API_PORT ?? '3001';
if (![webPort, apiPort].every(port => /^\d{1,5}$/.test(port) && Number(port) > 0 && Number(port) <= 65535)) throw new Error('Invalid E2E ports');
const origin = `http://localhost:${webPort}`;
const api = `http://127.0.0.1:${apiPort}`;
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, retries: process.env.CI ? 1 : 0,
  use: { baseURL: origin, trace: 'retain-on-failure', launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {} },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'npm run dev -w @investorkit/api', url: `${api}/ready`, reuseExistingServer: false,
      env: { DATABASE_URL: databaseUrl, PORT: apiPort, WEB_ORIGIN: origin, BETTER_AUTH_URL: origin, NODE_ENV: 'test' } },
    { command: `npm run dev -w @investorkit/web -- --port ${webPort}`, url: origin, reuseExistingServer: false, env: { API_PROXY_TARGET: api } },
  ],
});
