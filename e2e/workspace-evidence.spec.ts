import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { createPdfToolkit } from 'pdfstudio';
import { readFile } from 'node:fs/promises';

async function fixture() {
  const pdf = await PDFDocument.create();
  for (const width of [420, 440, 460, 480]) {
    const page = pdf.addPage([width, 600]);
    page.drawText(`Synthetic page ${width}`, { x: 20, y: 500, size: 16 });
    page.drawRectangle({ x: 20, y: 200, width: width - 40, height: 100 });
  }
  return { name: 'private-fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}

test('selected encrypted output keeps page order and worker traffic remains same-origin', async ({ page, context }, info) => {
  const origin = new URL(String(info.project.use.baseURL)).origin;
  const violations: string[] = [];
  const paths: string[] = [];
  // Context-level observation also includes requests initiated by Workers.
  context.on('request', request => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    paths.push(url.pathname);
    if (url.origin !== origin || request.method() !== 'GET' || url.search || request.postData() ||
      !(url.pathname === '/' || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/mascots/')) || request.url().includes('private-fixture')) violations.push(`${request.method()} ${url.pathname}`);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose files', exact: true })).toBeEnabled();
  expect(paths.some(path => /\/(?:pdf(?:\.worker)?-|PdfExport|PdfSecurity|qpdf)/i.test(path))).toBe(false);
  await page.screenshot({ path: info.outputPath('desktop-welcome.png'), fullPage: true });
  await page.locator('input[type=file]').setInputFiles(await fixture());
  await page.getByRole('checkbox', { name: 'Include page 4 in selection', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Include page 2 in selection', exact: true }).check();
  const password = ' รหัสผ่าน-selected-🔐 ';
  await page.getByLabel('Require a password to open the saved PDF', { exact: true }).check();
  await page.getByLabel('New PDF password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save selected pages', exact: true }).click();
  const download = await pending;
  const bytes = await readFile((await download.path())!);
  const toolkit = await createPdfToolkit();
  const metadata = await toolkit.getInfo(bytes, { password });
  expect(metadata.encrypted).toBe(true);
  expect(metadata.encryption).toMatchObject({ bits: 256, method: 'AESv3' });
  const output = await PDFDocument.load(await toolkit.unlock(bytes, { password }));
  expect(output.getPages().map(page => page.getWidth())).toEqual([440, 480]);
  await expect(page.locator('article.card')).toHaveCount(4);
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator('article.card').first().locator('.preview img')).toBeVisible();
  await page.screenshot({ path: info.outputPath('desktop-workspace.png'), fullPage: true });
  await page.getByRole('button', { name: 'Preview page 1', exact: true }).click();
  const image = page.getByRole('dialog', { name: 'Page preview' }).locator('img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: info.outputPath('desktop-page-preview.png') });
  expect(paths.some(path => path.includes('PdfExport.worker'))).toBe(true);
  expect(paths.some(path => path.includes('PdfSecurity.worker'))).toBe(true);
  expect(violations).toEqual([]);
});

test('mobile selection and preview are usable without dragging or a hardware keyboard', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await fixture());
  await page.getByRole('checkbox', { name: 'Include page 1 in selection', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Include page 2 in selection', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Save selected pages', exact: true })).toBeEnabled();
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator('article.card').first().locator('.preview img')).toBeVisible();
  await page.screenshot({ path: info.outputPath('mobile-workspace.png'), fullPage: true });
  await page.getByRole('button', { name: 'Preview page 1', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Page preview' });
  await expect(dialog.locator('img')).toBeVisible();
  const previous = await dialog.locator('img').getAttribute('src');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(dialog.getByText('Page 2 of 4', { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const images = dialog.locator('img');
    if (await images.count() !== 1) return false;
    return images.evaluate((node: HTMLImageElement, old) => node.complete && node.naturalWidth > 0 && node.src !== old, previous);
  }).toBe(true);
  await page.screenshot({ path: info.outputPath('mobile-page-preview.png') });
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
