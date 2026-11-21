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
  expect(headers['cache-control']).toContain('no-transform');
  expect(headers['content-security-policy']).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toContain("connect-src 'self' blob:");
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-content-type-options']).toBe('nosniff');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://pdf.quackandhonk.com/');
  await expect(page.getByRole('button', { name: 'Choose files', exact: true })).toBeVisible();
  expect(violations).toEqual([]);
});

test('fingerprinted files are immutable and the asset directory serves no app shell', async ({ page, request }) => {
  await page.goto('/');
  const script = await page.locator('script[type=module][src]').getAttribute('src');
  const stylesheet = await page.locator('link[rel=stylesheet]').getAttribute('href');
  for (const path of [script, stylesheet]) {
    expect(path).toMatch(/^\/assets\//);
    const response = await request.get(path!);
    expect(response.ok()).toBe(true);
    expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  }

  const missing = await request.get('/assets/not-a-built-file.js');
  expect(missing.status()).toBe(404);
  expect(await missing.text()).not.toContain('<div id="root">');
});
