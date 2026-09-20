import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readdir } from 'node:fs/promises';

test('lazy password runtime uses only local static assets and real AES-256', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('A base URL is required');
  const origin = new URL(baseURL).origin;
  const requests: string[] = [];
  const violations: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    requests.push(url.pathname);
    if (url.origin !== origin || request.method() !== 'GET' || url.search || request.postData() ||
        !(url.pathname === '/' || url.pathname === '/app-icon.svg' ||
          url.pathname.startsWith('/assets/') || url.pathname.startsWith('/mascots/'))) {
      violations.push(`${request.method()} ${url.pathname}`);
    }
  });
  const errors: string[] = [];
  const workers: string[] = [];
  page.on('worker', worker => workers.push(new URL(worker.url()).pathname));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose files', exact: true })).toBeVisible();
  expect(requests.some(path => /qpdf|PdfSecurity/.test(path))).toBe(false);

  // Exercise the built module, including its real dynamic JS/WASM imports.
  // This complements the user-facing password flows added by the UI owner.
  const chunk = (await readdir('dist/assets')).find(name => /^PdfSecurity-.*\.js$/.test(name));
  if (!chunk) throw new Error('The built password module is missing');
  const pdf = await PDFDocument.create();
  pdf.addPage([111, 400]).drawText('Synthetic vector text', { x: 10, y: 100, size: 10 });
  const input = Array.from(await pdf.save());
  const result = await page.evaluate(async ({ path, input }) => {
    const { lockPdf, unlockPdf } = await import(/* @vite-ignore */ path);
    const source = new Uint8Array(input);
    const password = ' รหัสผ่าน-🔐 ';
    const encrypted = await lockPdf(source, password);
    const codes = [];
    for (const wrong of ['', 'wrong', password.trim()]) {
      try { await unlockPdf(encrypted.buffer, wrong); codes.push('unexpected-success'); }
      catch (error) { codes.push((error as { code: string }).code); }
    }
    const unlocked = await unlockPdf(encrypted.buffer, password);
    return {
      sourceIntact: source.every((byte, index) => byte === input[index]),
      aes256: /\/AESV3/.test(new TextDecoder().decode(encrypted)),
      codes, unlocked: Array.from(new Uint8Array(unlocked)),
    };
  }, { path: `/assets/${chunk}`, input });
  expect(result.aes256).toBe(true);
  expect(result.sourceIntact).toBe(true);
  expect(result.codes).toEqual(['password-protected', 'password-protected', 'password-protected']);
  const reopened = await PDFDocument.load(new Uint8Array(result.unlocked));
  expect(reopened.getPages().map(p => [p.getWidth(), p.getHeight()])).toEqual([[111, 400]]);
  expect(requests.some(path => /^\/assets\/qpdf-.*\.wasm$/.test(path))).toBe(true);
  expect(workers.some(path => /^\/assets\/PdfSecurity\.worker-.*\.js$/.test(path))).toBe(true);
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});
