import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4317',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome']
  },
  webServer: {
    command: 'node apps/server/dist/index.js',
    url: 'http://127.0.0.1:4317/api/health',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
