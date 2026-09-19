import { test, expect, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function fixture(widths = [101, 202, 303]) {
  const pdf = await PDFDocument.create();
  for (const width of widths) {
    const page = pdf.addPage([width, 400]);
    page.drawRectangle({ x: 5, y: 10, width: 20, height: 30 });
  }
  return { name: 'workspace.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}
async function openFiles(page: Page, widths?: number[]) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await fixture(widths));
  await expect(page.getByRole('button', { name: 'Save PDF', exact: true })).toBeEnabled();
}
async function output(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return PDFDocument.load(await readFile((await download.path())!));
}

test('range selection and selected export preserve the workspace and output order', async ({ page }) => {
  await openFiles(page);
  await page.getByRole('button', { name: 'Select page 1 from workspace.pdf', exact: true }).click();
  await page.getByRole('button', { name: 'Select page 3 from workspace.pdf', exact: true }).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('button', { name: /^Select page .* from workspace.pdf$/, pressed: true })).toHaveCount(3);
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Include page 3 in selection', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Include page 1 in selection', exact: true }).check();
  const pdf = await output(page, 'Save selected pages');
  expect(pdf.getPages().map(p => p.getWidth())).toEqual([101, 303]);
  await expect(page.locator('article.card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(page.getByRole('checkbox', { checked: true, name: /^Include page/ })).toHaveCount(3);
});

test('full page preview supports navigation, zoom, escape and restores focus', async ({ page }) => {
  await openFiles(page);
  const trigger = page.getByRole('button', { name: 'Preview page 1', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Page preview' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img')).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(dialog.getByText('Page 2 of 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(dialog.getByText('125%', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('cancel terminates a pending assembly worker without downloading and permits retry', async ({ page }) => {
  const downloads: string[] = [];
  page.on('download', download => downloads.push(download.suggestedFilename()));
  await openFiles(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/assets\/PdfExport\.worker-[^/]+\.js$/, async route => {
    await gate;
    await route.continue().catch(() => {});
  });
  const requested = page.waitForRequest(/\/assets\/PdfExport\.worker-[^/]+\.js$/);
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  await requested;
  await page.getByRole('button', { name: 'Cancel export', exact: true }).click();
  await expect(page.getByText('Export cancelled. Your pages are unchanged.', { exact: true })).toBeVisible();
  release();
  await page.unroute(/\/assets\/PdfExport\.worker-[^/]+\.js$/);
  expect(downloads).toEqual([]);
  expect((await output(page, 'Save PDF')).getPageCount()).toBe(3);
});

test('a long document loads nearby thumbnails instead of every page, then renders the last page', async ({ page }) => {
  await openFiles(page, Array.from({ length: 100 }, (_, i) => 200 + i));
  await expect(page.locator('article.card')).toHaveCount(100);
  await expect(page.locator('article.card').first().locator('.preview img')).toBeVisible();
  expect(await page.locator('article.card .preview img').count()).toBeLessThan(40);
  await page.locator('article.card').last().scrollIntoViewIfNeeded();
  await expect(page.locator('article.card').last().locator('.preview img')).toBeVisible();
  expect(await page.locator('article.card .preview img').count()).toBeLessThan(40);
});
