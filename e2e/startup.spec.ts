import { expect, test, type Download, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

const pdfRuntimeAsset = /\/assets\/PdfJsRuntime-.*\.js$/;
const pdfRuntimeOrWorker = /PdfJsRuntime|pdf\.worker/i;
const exportOrSecurityRuntime = /PdfExport\.worker|PdfSecurity|PdfCompression|qpdf|fontkit|NotoSansThaiLooped|\.wasm$/i;

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose files', exact: true })).toBeEnabled();
}

async function syntheticPng(page: Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 80; canvas.height = 60;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#e8f1e9'; context.fillRect(0, 0, 80, 60);
    context.fillStyle = '#c44c31'; context.fillRect(8, 12, 36, 28);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return { name: 'image-only.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') };
}

async function syntheticPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([240, 360]);
  return { name: 'first-use.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}

async function expectDecodedImages(page: Page, count: number) {
  await expect(page.locator('article .page-thumbnail img')).toHaveCount(count);
  await expect.poll(() => page.locator('article .page-thumbnail img').evaluateAll(images => images.every(image => {
    const element = image as HTMLImageElement;
    return element.complete && element.naturalWidth > 0;
  }))).toBe(true);
}

async function reopenDownload(download: Download) {
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  if (!path) throw new Error('The download has no local file');
  return PDFDocument.load(await readFile(path));
}

test('empty startup and image-only export leave PDF.js and security runtimes unloaded', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await ready(page);

  expect(requests.some(path => pdfRuntimeOrWorker.test(path) || exportOrSecurityRuntime.test(path))).toBe(false);
  await page.locator('input[type=file]').setInputFiles(await syntheticPng(page));
  await expectDecodedImages(page, 1);
  expect(requests.some(path => pdfRuntimeOrWorker.test(path) || exportOrSecurityRuntime.test(path))).toBe(false);

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  const download = await pending;
  const output = await reopenDownload(download);
  expect(output.getPages().map(pdfPage => [pdfPage.getWidth(), pdfPage.getHeight()])).toEqual([[80, 60]]);
  expect(requests.some(path => /PdfExport\.worker/.test(path))).toBe(true);
  expect(requests.some(path => pdfRuntimeOrWorker.test(path) || /PdfSecurity|PdfCompression|qpdf|fontkit|NotoSansThaiLooped|\.wasm$/i.test(path))).toBe(false);
});

test('a failed PDF runtime request preserves an image workspace and offers an honest retry', async ({ page }) => {
  const requests: string[] = [];
  let failRuntime = true;
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.route(pdfRuntimeAsset, route => {
    if (failRuntime) {
      failRuntime = false;
      return route.fulfill({ status: 503, contentType: 'text/javascript', body: 'temporarily unavailable' });
    }
    return route.continue();
  });
  await ready(page);
  await page.locator('input[type=file]').setInputFiles(await syntheticPng(page));
  await expectDecodedImages(page, 1);

  const pdf = await syntheticPdf();
  await page.locator('input[type=file]').setInputFiles(pdf);
  await expect(page.getByRole('alert')).toHaveText('The PDF tools couldn’t load. Check your connection and try again. If it still fails, save any open work before reloading this tab.');
  await expect(page.locator('article')).toHaveCount(1);
  await expectDecodedImages(page, 1);

  await page.locator('input[type=file]').setInputFiles(pdf);
  await expect(page.getByRole('alert')).toHaveText('The PDF tools couldn’t load. Check your connection and try again. If it still fails, save any open work before reloading this tab.');
  await expect(page.locator('article')).toHaveCount(1);
  await expectDecodedImages(page, 1);
  // Chromium 153 caches the failed native module fetch even though the app
  // clears its own rejected promise. The loader unit test proves the second
  // import() call; this request count records the browser-level limitation.
  expect(requests.filter(path => pdfRuntimeAsset.test(path))).toHaveLength(1);
  expect(requests.some(path => /pdf\.worker/.test(path))).toBe(false);

  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  const download = await pendingDownload;
  const output = await reopenDownload(download);
  expect(output.getPageCount()).toBe(1);
});
