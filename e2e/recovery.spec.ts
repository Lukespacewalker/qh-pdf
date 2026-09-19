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
  await expect(page.locator('.drag-overlay')).toHaveCount(0);
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
  // A failed save immediately turns recovery off; click must not assert it stays checked.
  await page.getByLabel('Remember work on this device').click();
  await expect(page.getByRole('alert')).toContainText('could not save');
  await expect(page.getByLabel('Remember work on this device')).not.toBeChecked();
  expect(await exportWidths(page)).toEqual([111, 222, 333]);
});

test('an initially empty stale tab cannot recreate a saved copy after another tab clears it', async ({ page, context }) => {
  await page.goto('/');
  await importPages(page);
  const other = await context.newPage();
  await other.goto('/');
  await importPages(other);
  await other.getByLabel('Remember work on this device').check();
  await expect(other.getByTestId('recovery-status')).toHaveText('Saved on this device');
  await other.getByRole('button', { name: 'Clear saved work' }).click();
  await expect(other.getByTestId('recovery-status')).toHaveText('Saved copy cleared. Recovery is off.');
  const cleared = await other.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('qh-pdf-recovery', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('workspaces', 'readonly');
      const value = transaction.objectStore('workspaces').get('current');
      transaction.oncomplete = () => { resolve(value.result); db.close(); };
    };
  }));
  expect(cleared).toEqual({ revision: expect.any(String), savedAt: expect.any(Number), snapshot: null });
  await page.getByLabel('Remember work on this device').click();
  await expect(page.getByRole('alert')).toContainText('another tab');
  await expect(page.getByLabel('Remember work on this device')).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Restore saved work' })).toHaveCount(0);
  await importPages(page);
  await page.getByLabel('Remember work on this device').check();
  await expect(page.getByTestId('recovery-status')).toHaveText('Saved on this device');
});

test('keyboard reordering supports drop and cancellation', async ({ page }) => {
  await page.goto('/');
  await importPages(page);
  await page.getByRole('button', { name: 'Drag page 1 to reorder' }).focus();
  // A held key allows the sensor's deferred key listener to attach before the next key.
  await page.keyboard.press('Space', { delay: 60 });
  await expect(page.locator('.drag-overlay')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Move to position 2.', { exact: true })).toBeAttached();
  await page.keyboard.press('Space', { delay: 60 });
  await expect(page.locator('.drag-overlay')).toHaveCount(0);
  expect(await exportWidths(page)).toEqual([222, 111, 333]);
  await page.getByRole('button', { name: 'Drag page 1 to reorder' }).focus();
  await page.keyboard.press('Space', { delay: 60 });
  await expect(page.locator('.drag-overlay')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Move to position 2.', { exact: true })).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(page.locator('.drag-overlay')).toHaveCount(0);
  expect(await exportWidths(page)).toEqual([222, 111, 333]);
});

test('turning recovery off immediately cannot leave a queued snapshot behind', async ({ page }) => {
  await page.goto('/');
  await importPages(page);
  await page.getByLabel('Remember work on this device').check();
  await page.getByLabel('Remember work on this device').uncheck();
  await expect(page.getByTestId('recovery-status')).toHaveText('Saved copy cleared. Recovery is off.');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Restore saved work' })).toHaveCount(0);
});

test('failed clearing never claims that the saved copy was removed', async ({ page }) => {
  await page.goto('/');
  await importPages(page);
  await page.getByLabel('Remember work on this device').check();
  await expect(page.getByTestId('recovery-status')).toHaveText('Saved on this device');
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () { throw new DOMException('Synthetic write failure', 'UnknownError'); };
    IDBObjectStore.prototype.delete = function () { throw new DOMException('Synthetic delete failure', 'UnknownError'); };
  });
  await page.getByRole('button', { name: 'Clear saved work' }).click();
  await expect(page.getByRole('alert')).toContainText('could not clear');
  await expect(page.getByTestId('recovery-status')).not.toContainText('cleared');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Restore saved work' })).toBeVisible();
});

test('touch drag handles rearrange pages at a mobile viewport', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await importPages(page);
    const first = await page.getByRole('button', { name: 'Drag page 1 to reorder' }).boundingBox();
    const second = await page.getByRole('button', { name: 'Drag page 2 to reorder' }).boundingBox();
    if (!first || !second) throw new Error('Missing touch target');
    const session = await context.newCDPSession(page);
    const start = { x: first.x + first.width / 2, y: first.y + first.height / 2 };
    const end = { x: second.x + second.width / 2, y: second.y + second.height / 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let i = 1; i <= 10; i++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * i / 10, y: start.y }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.drag-overlay')).toHaveCount(0);
    // dnd-kit's pointer sensor suppresses native clicks for 50ms after dropping.
    await page.waitForTimeout(60);
    expect(await exportWidths(page)).toEqual([222, 111, 333]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
