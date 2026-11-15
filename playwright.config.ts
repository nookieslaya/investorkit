import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure', launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {} },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'npm run dev -w @investorkit/api', url: 'http://127.0.0.1:3001/ready', reuseExistingServer: !process.env.CI },
    { command: 'npm run dev -w @investorkit/web', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
  ],
});
