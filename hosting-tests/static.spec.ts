import { test, expect } from '@playwright/test';

test('serves the workspace with browser security headers', async ({ page }) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', event => {
      console.error(`CSP violation: ${event.violatedDirective}`);
    });
  });
  page.on('console', message => {
    if (message.text().startsWith('CSP violation:')) violations.push(message.text());
  });
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  const headers = response!.headers();
  expect(headers['content-security-policy']).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toContain("connect-src 'self' blob:");
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-content-type-options']).toBe('nosniff');
  await expect(page.getByRole('button', { name: 'Choose files', exact: true })).toBeVisible();
  expect(violations).toEqual([]);
});
