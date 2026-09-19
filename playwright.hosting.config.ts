import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// An explicit URL opt-in runs synthetic workflows against a live site.
// Default verification only starts the local Cloudflare runtime and never deploys.
const liveUrl = process.env.QH_PDF_BASE_URL;
export default defineConfig({
  ...base,
  testDir: '.',
  outputDir: liveUrl ? './test-results/live' : './test-results/hosting',
  testMatch: ['e2e/*.spec.ts', 'hosting-tests/*.spec.ts'],
  use: { ...base.use, baseURL: liveUrl ?? 'http://127.0.0.1:8787' },
  webServer: liveUrl ? undefined : {
    command: 'wrangler dev --local --ip 127.0.0.1 --port 8787',
    url: 'http://127.0.0.1:8787',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
