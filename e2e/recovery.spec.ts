import { test, expect, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function importPages(page: Page) {
  const pdf = await PDFDocument.create();
  [111, 222, 333].forEach(width => pdf.addPage([width, 400]));
  await page.locator('input[type=file]').setInputFiles({ name: 'recovery-fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await expect(page.locator('article')).toHaveCount(3);
}
async function exportWidths(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  const download = await pending;
  const pdf = await PDFDocument.load(await readFile((await download.path())!));
  return pdf.getPages().map(p => p.getWidth());
}
test('drag handles and arrows change export order and dragging can be undone', async ({ page }) => {
  await page.goto('/');
  await importPages(page);
  const handle = await page.getByRole('button', { name: 'Drag page 1 to reorder' }).boundingBox();
  const target = await page.locator('article').nth(2).boundingBox();
  if (!handle || !target) throw new Error('Missing drag target');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
  await page.mouse.up();
  expect(await exportWidths(page)).toEqual([222, 333, 111]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportWidths(page)).toEqual([111, 222, 333]);
  await page.getByRole('button', { name: 'Move page 3 left' }).click();
  expect(await exportWidths(page)).toEqual([111, 333, 222]);
  await expect(page.getByRole('button', { name: 'Move page 3 right' })).toBeDisabled();
});
test('recovery is opt-in, restores edits after reload and clears stored work without closing the workspace', async ({ page }) => {
  await page.goto('/');
  await importPages(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Restore saved work' })).toHaveCount(0);
  await importPages(page);
  await page.getByLabel('Remember work on this device').check();
  await expect(page.getByTestId('recovery-status')).toHaveText('Saved on this device');
  await page.getByRole('button', { name: 'Move page 3 left' }).click();
  await expect(page.getByTestId('recovery-status')).toHaveText('Saved on this device');
  await page.reload();
  await page.getByRole('button', { name: 'Restore saved work' }).click();
  await expect(page.locator('article')).toHaveCount(3);
  expect(await exportWidths(page)).toEqual([111, 333, 222]);
  await page.getByRole('button', { name: 'Clear saved work' }).click();
  await expect(page.getByTestId('recovery-status')).toHaveText('Saved copy cleared. Recovery is off.');
  await expect(page.locator('article')).toHaveCount(3);
  await expect(page.getByLabel('Remember work on this device')).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Restore saved work' })).toHaveCount(0);
});
test('a second tab cannot silently overwrite or recreate another tab’s cleared recovery copy', async ({ page, context }) => {
  await page.goto('/');
  await importPages(page);
  await page.getByLabel('Remember work on this device').check();
  await expect(page.getByTestId('recovery-status')).toHaveText('Saved on this device');
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: 'Restore saved work' }).click();
  await expect(other.locator('article')).toHaveCount(3);
  await page.getByRole('button', { name: 'Clear saved work' }).click();
  await expect(page.getByTestId('recovery-status')).toHaveText('Saved copy cleared. Recovery is off.');
  await other.getByRole('button', { name: 'Move page 3 left' }).click();
  await expect(other.getByRole('alert')).toContainText('another tab');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Restore saved work' })).toHaveCount(0);
});
test('a storage failure remains visible and does not prevent exporting the open document', async ({ page }) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); };
  });
  await page.goto('/');
  await importPages(page);
  await page.getByLabel('Remember work on this device').check();
  await expect(page.getByRole('alert')).toContainText('could not save');
  expect(await exportWidths(page)).toEqual([111, 222, 333]);
});
