import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, degrees } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function pdfFile(name: string, widths: number[], rotation = 0) {
  const pdf = await PDFDocument.create();
  for (const width of widths) {
    const p = pdf.addPage([width, 400]);
    p.setRotation(degrees(rotation));
    p.drawRectangle({ x: 10, y: 20, width: 40, height: 60 });
  }
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}
async function exportPdf(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  if (!path) throw new Error('The download has no local file');
  return PDFDocument.load(await readFile(path));
}
async function expectThumbnails(page: Page, count: number) {
  const images = page.locator('article .preview img');
  await expect(images).toHaveCount(count);
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => {
    const image = node as HTMLImageElement;
    return image.complete && image.naturalWidth > 0 && image.src.startsWith('blob:');
  }))).toBe(true);
}

test('all six locally served mascot files decode and the empty state uses a real image', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.locator('.mascot').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const names = ['honk-happy', 'honk-error', 'honk-worried-warning', 'quack-hello', 'quack-working', 'quack-empty-state'];
  for (const name of names) {
    expect(await page.evaluate(async name => {
      const image = new Image();
      image.src = `/mascots/${name}.webp`;
      await image.decode();
      return image.naturalWidth;
    }, name)).toBeGreaterThan(0);
  }
});

test('real PDF previews and edited export preserve order, duplicate pages and source rotation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles([
    await pdfFile('a.pdf', [111, 222], 90), await pdfFile('b.pdf', [333]),
  ]);
  await expectThumbnails(page, 3);
  await page.getByRole('button', { name: 'Select page 1 from a.pdf', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(4);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(4);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Move page 4 left', exact: true }).click();
  const output = await exportPdf(page);
  expect(output.getPages().map(p => p.getWidth())).toEqual([111, 111, 333, 222]);
  expect(output.getPages().map(p => p.getRotation().angle)).toEqual([180, 180, 0, 90]);
  await expect(page.getByText('Your PDF is ready.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('mixes PNG, JPEG, WebP and PDF without non-static network requests', async ({ page }) => {
  const violations: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    if (url.origin !== 'http://127.0.0.1:4173' || request.method() !== 'GET' || url.search ||
        !(url.pathname === '/' || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/mascots/'))) {
      violations.push(`${request.method()} ${url.pathname}`);
    }
    if (request.url().includes('private-fixture') || request.postData()) violations.push('Unexpected payload or filename');
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const pictures = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 50;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 40, 50);
    return ['image/png', 'image/jpeg', 'image/webp'].map(type => ({ type, data: canvas.toDataURL(type).split(',')[1] }));
  });
  const files = [await pdfFile('private-fixture.pdf', [111]), ...pictures.map((p, i) => ({
    name: `private-fixture-${i}.${['png', 'jpg', 'webp'][i]}`,
    mimeType: p.type, buffer: Buffer.from(p.data, 'base64'),
  }))];
  await page.locator('input[type=file]').setInputFiles(files);
  await expectThumbnails(page, 4);
  const output = await exportPdf(page);
  expect(output.getPages().map(p => [p.getWidth(), p.getHeight()])).toEqual([[111, 400], [40, 50], [40, 50], [40, 50]]);
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('can undo deleting the final page and import the same file again', async ({ page }) => {
  await page.goto('/');
  const file = await pdfFile('single.pdf', [123]);
  await page.locator('input[type=file]').setInputFiles(file);
  await expectThumbnails(page, 1);
  await page.locator('article .preview').click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(1);
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.locator('article')).toHaveCount(2);
});

test('reports invalid input and allows recovery', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
  await expect(page.getByRole('alert')).toContainText('We couldn’t open this PDF.');
  await expect(page.getByRole('button', { name: 'Choose files', exact: true })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(await pdfFile('valid.pdf', [222]));
  await expectThumbnails(page, 1);
});

test('mobile viewport has no horizontal overflow and supports non-drag editing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await pdfFile('mobile.pdf', [111, 222]));
  await expectThumbnails(page, 2);
  await page.getByRole('button', { name: 'Move page 2 left', exact: true }).click();
  const output = await exportPdf(page);
  expect(output.getPages().map(p => p.getWidth())).toEqual([222, 111]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
