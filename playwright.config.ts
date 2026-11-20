import { defineConfig, devices } from '@playwright/test';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required for E2E; use a migrated disposable database.');
const webPort = process.env.E2E_WEB_PORT ?? '5173';
const apiPort = process.env.E2E_API_PORT ?? '3001';
const journalWebPort = process.env.E2E_JOURNAL_WEB_PORT ?? String(Number(webPort) + 1);
const journalApiPort = process.env.E2E_JOURNAL_API_PORT ?? String(Number(apiPort) + 1);
const csvWebPort = process.env.E2E_CSV_WEB_PORT ?? String(Number(webPort) + 2);
const csvApiPort = process.env.E2E_CSV_API_PORT ?? String(Number(apiPort) + 2);
const ports = [webPort, apiPort, journalWebPort, journalApiPort, csvWebPort, csvApiPort];
if (new Set(ports).size !== ports.length || !ports.every(port => /^\d{1,5}$/.test(port) && Number(port) > 0 && Number(port) <= 65535)) throw new Error('Invalid E2E ports');
const origin = `http://localhost:${webPort}`;
const api = `http://127.0.0.1:${apiPort}`;
const journalOrigin = `http://localhost:${journalWebPort}`;
const journalApi = `http://127.0.0.1:${journalApiPort}`;
const csvOrigin = `http://localhost:${csvWebPort}`;
const csvApi = `http://127.0.0.1:${csvApiPort}`;
export default defineConfig({
  // Keep browser rendering/keyboard timings deterministic on the shared local machine and CI.
  workers: 1,
  testDir: './tests/e2e', fullyParallel: false, retries: process.env.CI ? 1 : 0,
  use: { baseURL: origin, trace: 'retain-on-failure', launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {} },
  // Journal and snapshot history share their own servers: parallel signup/CRUD must not consume the other suite's rate limit.
  projects: [
    { name: 'csv-chromium', testMatch: '**/csv-import.spec.ts', use: { ...devices['Desktop Chrome'], baseURL: csvOrigin, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' } },
    { name: 'chromium', testIgnore: ['**/journal.spec.ts', '**/history.spec.ts', '**/market.spec.ts', '**/csv-import.spec.ts'], use: { ...devices['Desktop Chrome'] } },
    { name: 'journal-chromium', testMatch: ['**/journal.spec.ts', '**/history.spec.ts', '**/market.spec.ts'], use: { ...devices['Desktop Chrome'], baseURL: journalOrigin, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' } },
  ],
  webServer: [
    { command: 'npm run dev -w @investorkit/api', url: `${csvApi}/ready`, reuseExistingServer: false,
      env: { DATABASE_URL: databaseUrl, PORT: csvApiPort, WEB_ORIGIN: csvOrigin, BETTER_AUTH_URL: csvOrigin, NODE_ENV: 'test', MARKETSTACK_ENABLED: 'false' } },
    { command: `npm run dev -w @investorkit/web -- --port ${csvWebPort}`, url: csvOrigin, reuseExistingServer: false, env: { API_PROXY_TARGET: csvApi } },
    { command: 'npm run dev -w @investorkit/api', url: `${journalApi}/ready`, reuseExistingServer: false,
      env: { DATABASE_URL: databaseUrl, PORT: journalApiPort, WEB_ORIGIN: journalOrigin, BETTER_AUTH_URL: journalOrigin, NODE_ENV: 'test', MARKETSTACK_ENABLED: 'false' } },
    { command: `npm run dev -w @investorkit/web -- --port ${journalWebPort}`, url: journalOrigin, reuseExistingServer: false, env: { API_PROXY_TARGET: journalApi } },
    { command: 'npm run dev -w @investorkit/api', url: `${api}/ready`, reuseExistingServer: false,
      env: { DATABASE_URL: databaseUrl, PORT: apiPort, WEB_ORIGIN: origin, BETTER_AUTH_URL: origin, NODE_ENV: 'test', MARKETSTACK_ENABLED: 'false' } },
    { command: `npm run dev -w @investorkit/web -- --port ${webPort}`, url: origin, reuseExistingServer: false, env: { API_PROXY_TARGET: api } },
  ],
});
