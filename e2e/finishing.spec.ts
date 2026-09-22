import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function importFixture(page: Page) {
  const pdf = await PDFDocument.create();
  for (const rotation of [0, 90, 180, 270]) {
    const p = pdf.addPage([400, 500]);
    p.setCropBox(10, 20, 200, 300);
    p.setRotation(degrees(rotation));
    p.drawRectangle({ x: 10, y: 20, width: 100, height: 150, color: rgb(0.1, 0.5, 0.3) });
    p.drawText(`Source ${rotation}`, { x: 50, y: 180, size: 14 });
  }
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'finishing.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await expect(page.locator('article')).toHaveCount(4);
}

async function download(page: Page, button = 'Save PDF') {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return PDFDocument.load(await readFile((await file.path())!));
}

test('crop export follows visible edges for every source rotation and supports undo/reset', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  const opener = page.getByRole('button', { name: 'Crop', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Crop selected pages' });
  await expect(dialog.getByRole('img')).toBeVisible();
  await dialog.getByLabel('Top (%)', { exact: true }).fill('10');
  await dialog.getByLabel('Right (%)', { exact: true }).fill('20');
  await dialog.getByLabel('Bottom (%)', { exact: true }).fill('20');
  await dialog.getByLabel('Left (%)', { exact: true }).fill('10');
  await dialog.getByRole('button', { name: 'Apply to 4 pages' }).click();
  await expect(opener).toBeFocused();
  const output = await download(page);
  expect(output.getPages().map(p => p.getCropBox())).toEqual([
    { x: 30, y: 80, width: 140, height: 210 }, { x: 30, y: 50, width: 140, height: 210 },
    { x: 50, y: 50, width: 140, height: 210 }, { x: 50, y: 80, width: 140, height: 210 },
  ]);
  await page.getByRole('button', { name: 'Preview page 2 from finishing.pdf', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Page preview', exact: true });
  const image = preview.locator('img');
  await expect(image).toBeVisible();
  expect(await image.evaluate((image: HTMLImageElement) => image.naturalWidth / image.naturalHeight)).toBeCloseTo(1.5, 1);
  await preview.getByRole('button', { name: 'Close preview' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await download(page)).getPages().every(p => p.getCropBox().width === 200)).toBe(true);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await opener.click();
  await dialog.getByRole('button', { name: 'Reset crop' }).click();
  await dialog.getByRole('button', { name: 'Apply to 4 pages' }).click();
  expect((await download(page)).getPages().every(p => p.getCropBox().height === 300)).toBe(true);
});

test('crop cancels without changes and prevents an empty kept area at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await importFixture(page);
  await page.getByRole('button', { name: 'Select page 1 from finishing.pdf', exact: true }).click();
  await page.getByRole('button', { name: 'Crop', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Crop selected pages' });
  await dialog.getByLabel('Left (%)', { exact: true }).fill('60');
  await dialog.getByLabel('Right (%)', { exact: true }).fill('40');
  await expect(dialog.getByRole('button', { name: 'Apply to 1 pages' })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await download(page, 'Save 1 selected page')).getPage(0).getCropBox()).toEqual({ x: 10, y: 20, width: 200, height: 300 });
});
