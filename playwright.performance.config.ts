import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: './performance-tests',
  outputDir: './test-results/performance',
  timeout: 60000,
  reporter: [['list'], ['json', { outputFile: 'test-results/performance-results.json' }]],
});
