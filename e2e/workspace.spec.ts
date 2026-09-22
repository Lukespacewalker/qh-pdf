import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, degrees } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

const renderTimeout = 15_000;

async function pdfFile(name: string, widths: number[], rotation = 0) {
  const pdf = await PDFDocument.create();
  for (const width of widths) {
    const p = pdf.addPage([width, 400]);
    p.setRotation(degrees(rotation));
    p.drawRectangle({ x: 10, y: 20, width: 40, height: 60 });
  }
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) };
}
async function downloadPdf(page: Page, buttonName: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  if (!path) throw new Error('The download has no local file');
  return { download, pdf: await PDFDocument.load(await readFile(path)) };
}
async function exportPdf(page: Page) {
  return (await downloadPdf(page, 'Save PDF')).pdf;
}
async function expectThumbnails(page: Page, count: number) {
  const images = page.locator('article .page-thumbnail img');
  await expect(images).toHaveCount(count, { timeout: renderTimeout });
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => {
    const image = node as HTMLImageElement;
    return image.complete && image.naturalWidth > 0 && image.src.startsWith('blob:');
  })), { timeout: renderTimeout }).toBe(true);
}

test('all six locally served mascot files decode and the empty state uses a real image', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Runs in your browser', { exact: true })).toBeVisible();
  await expect(page.getByText('Private · Browser-based', { exact: true })).toHaveCount(0);
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

test('brand discovery uses one bottom banner link and a local mascot', async ({ page }) => {
  await page.goto('/');

  const header = page.locator('header');
  await expect(header.getByText('Quack & Honk PDF', { exact: true })).toBeVisible();
  const appIcon = header.locator('img[src$="/app-icon.svg"]');
  await expect(appIcon).toHaveAttribute('alt', '');
  await expect.poll(() => appIcon.evaluate(
    (element: HTMLImageElement) => element.complete && element.naturalWidth > 0,
  )).toBe(true);
  await expect(header.getByRole('link')).toHaveCount(0);

  const banner = page.getByRole('region', { name: 'More from Quack & Honk', exact: true });
  await expect(banner).toBeVisible();
  const link = banner.getByRole('link', { name: 'Visit quackandhonk.com (opens in a new tab)', exact: true });
  await expect(link).toHaveAttribute('href', 'https://quackandhonk.com');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('a[href="https://quackandhonk.com"]')).toHaveCount(1);
  await expect.poll(() => banner.locator('img[src$="/mascots/quack-hello.webp"]').evaluate(
    (element: HTMLImageElement) => element.complete && element.naturalWidth > 0,
  )).toBe(true);
});

test('the page advertises a decodable same-origin app icon', async ({ page }) => {
  await page.goto('/');
  const iconLink = page.locator('link[rel="icon"]');
  expect(await iconLink.count()).toBe(1);
  const href = await iconLink.getAttribute('href');
  expect(href).toBeTruthy();

  const icon = await page.evaluate(async href => {
    const url = new URL(href!, window.location.href);
    const image = new Image();
    image.src = url.href;
    await image.decode();
    return {
      sameOrigin: url.origin === window.location.origin,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }, href);

  expect(icon).toEqual({ sameOrigin: true, width: 64, height: 64 });
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

test('selection controls support touch-friendly toggles, Shift ranges, all/none and preview preservation', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await pdfFile('select.pdf', [110, 220, 330, 440, 550]));
  await expectThumbnails(page, 5);
  expect(await page.locator('.num').evaluateAll(badges => badges.every(badge => {
    const rect = badge.getBoundingClientRect();
    const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return topmost === badge || badge.contains(topmost);
  }))).toBe(true);
  await expect(page.locator('.head .sub')).toHaveText('5 pages');
  const selectionStatus = page.getByRole('status', { name: 'Selected pages', exact: true });
  await expect(selectionStatus).toHaveText('0 of 5 selected');

  await page.getByRole('checkbox', { name: 'Add page 1 from select.pdf to selection', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Add page 3 from select.pdf to selection', exact: true }).check();
  await expect(selectionStatus).toHaveText('2 of 5 selected');
  await expect(page.locator('article.selected')).toHaveCount(2);
  await page.getByRole('button', { name: 'Preview page 2 from select.pdf', exact: true }).click();
  await page.getByRole('dialog', { name: 'Page preview', exact: true }).getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(selectionStatus).toHaveText('2 of 5 selected');

  await page.getByRole('button', { name: 'Deselect all', exact: true }).click();
  await page.getByRole('button', { name: 'Select page 2 from select.pdf', exact: true }).click();
  await page.getByRole('button', { name: 'Select page 4 from select.pdf', exact: true }).click({ modifiers: ['Shift'] });
  await expect(selectionStatus).toHaveText('3 of 5 selected');
  await page.getByRole('button', { name: 'Select page 1 from select.pdf', exact: true }).click({ modifiers: ['Control', 'Shift'] });
  await expect(selectionStatus).toHaveText('4 of 5 selected');
  await expect(page.locator('article').nth(4)).not.toHaveClass(/selected/);

  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(selectionStatus).toHaveText('5 of 5 selected');
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click();
  await expect(selectionStatus).toHaveText('0 of 5 selected');
});

test('multi-page edit tools target exactly the selected pages and deletion is undoable', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await pdfFile('edit-selection.pdf', [110, 220, 330, 440, 550]));
  await expectThumbnails(page, 5);
  await page.getByRole('checkbox', { name: 'Add page 2 from edit-selection.pdf to selection', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Add page 4 from edit-selection.pdf to selection', exact: true }).check();
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await expect(page.locator('article').nth(1).locator('.meta')).toContainText('90°');
  await expect(page.locator('article').nth(3).locator('.meta')).toContainText('90°');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(7);
  await expect(page.locator('article.selected')).toHaveCount(2);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(5);
  await expect(page.locator('article.selected')).toHaveCount(0);
  const deletedOutput = await exportPdf(page);
  expect(deletedOutput.getPages().map(outputPage => outputPage.getWidth())).toEqual([110, 220, 330, 440, 550]);
  expect(deletedOutput.getPages().map(outputPage => outputPage.getRotation().angle)).toEqual([0, 90, 0, 90, 0]);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(7);
  await expect(page.locator('article.selected')).toHaveCount(2);
});

test('selected export follows workspace order and leaves all-pages export unchanged', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await pdfFile('sparse.pdf', [110, 220, 330, 440, 550]));
  await expectThumbnails(page, 5);
  await expect(page.getByRole('button', { name: /Save \d+ selected pages?/ })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Add page 2 from sparse.pdf to selection', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Add page 5 from sparse.pdf to selection', exact: true }).check();
  await page.getByRole('button', { name: 'Move page 5 left', exact: true }).click();
  await page.getByRole('button', { name: 'Move page 4 left', exact: true }).click();
  await page.getByRole('button', { name: 'Move page 3 left', exact: true }).click();

  const selected = await downloadPdf(page, 'Save 2 selected pages');
  expect(selected.download.suggestedFilename()).toBe('quack-honk-selected-pages.pdf');
  expect(selected.pdf.getPages().map(outputPage => outputPage.getWidth())).toEqual([550, 220]);
  await expect(page.locator('article')).toHaveCount(5);
  await expect(page.locator('article.selected')).toHaveCount(2);

  const allPages = await exportPdf(page);
  expect(allPages.getPages().map(outputPage => outputPage.getWidth())).toEqual([110, 550, 220, 330, 440]);
});

test('selected export preserves duplicates, mixed sources and additive rotations', async ({ page }) => {
  await page.goto('/');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 50;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#b94d30'; context.fillRect(0, 0, 40, 50);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles([
    await pdfFile('mixed.pdf', [111, 222], 90),
    { name: 'picture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') },
  ]);
  await expectThumbnails(page, 3);
  await page.getByRole('checkbox', { name: 'Add page 2 from mixed.pdf to selection', exact: true }).check();
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Add page 4 from picture.png to selection', exact: true }).check();
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Add page 4 from picture.png to selection', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Add page 3 from mixed.pdf to selection', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Add page 2 from mixed.pdf to selection', exact: true }).check();

  const selected = await downloadPdf(page, 'Save 3 selected pages');
  expect(selected.pdf.getPages().map(outputPage => outputPage.getWidth())).toEqual([222, 222, 40]);
  expect(selected.pdf.getPages().map(outputPage => outputPage.getRotation().angle)).toEqual([180, 180, 90]);
  await expect(page.locator('article.selected')).toHaveCount(3);
  await expect(page.locator('article')).toHaveCount(4);
});

test('selected export progress and cancellation use only the submitted pages', async ({ page }) => {
  const pageCount = 30;
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.route(/\/assets\/PdfExport\.worker-.*\.js$/, async route => {
    await new Promise(resolve => setTimeout(resolve, 1_000));
    await route.continue();
  });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await pdfFile(
    'selected-progress.pdf', Array.from({ length: pageCount }, (_, index) => 200 + index),
  ));
  await expect(page.locator('article')).toHaveCount(pageCount, { timeout: renderTimeout });
  await page.getByRole('checkbox', { name: 'Add page 1 from selected-progress.pdf to selection', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Add page 30 from selected-progress.pdf to selection', exact: true }).check();
  await page.getByRole('button', { name: 'Save 2 selected pages', exact: true }).click();
  await expect(page.getByText('Creating page 0 of 2…', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Creating PDF' })).toHaveAttribute('max', '2');
  await page.getByRole('button', { name: 'Cancel export', exact: true }).click();

  await expect(page.getByText('Export cancelled. Your workspace is still here.', { exact: true })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Selected pages', exact: true })).toHaveText('2 of 30 selected');
  await expect(page.getByRole('button', { name: 'Save 2 selected pages', exact: true })).toBeEnabled();
  await page.waitForTimeout(500);
  expect(downloads).toBe(0);
});

test('selected export failure preserves the selection and permits a clean retry', async ({ page }) => {
  const workerAsset = /\/assets\/PdfExport\.worker-.*\.js$/;
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.route(workerAsset, route => route.abort());
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await pdfFile('selected-retry.pdf', [111, 222, 333]));
  await expectThumbnails(page, 3);
  await page.getByRole('checkbox', { name: 'Add page 2 from selected-retry.pdf to selection', exact: true }).check();
  await page.getByRole('button', { name: 'Save 1 selected page', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveText('We couldn’t create the PDF. Your workspace is still here.');
  await expect(page.locator('article')).toHaveCount(3);
  await expect(page.locator('article.selected')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Save 1 selected page', exact: true })).toBeEnabled();
  expect(downloads).toBe(0);

  await page.unroute(workerAsset);
  const retried = await downloadPdf(page, 'Save 1 selected page');
  expect(retried.download.suggestedFilename()).toBe('quack-honk-selected-pages.pdf');
  expect(retried.pdf.getPages().map(outputPage => outputPage.getWidth())).toEqual([222]);
  await expect(page.getByRole('status', { name: 'Selected pages', exact: true })).toHaveText('1 of 3 selected');
  expect(downloads).toBe(1);
});

test('full-page preview preserves selection while navigating and restores focus on Escape', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await pdfFile(
    'inspect.pdf', Array.from({ length: 12 }, (_, index) => 180 + index * 10),
  ));
  await expectThumbnails(page, 12);
  await page.getByRole('button', { name: 'Select page 1 from inspect.pdf', exact: true }).click();
  await page.getByRole('button', { name: 'Select page 3 from inspect.pdf', exact: true }).click({ modifiers: ['Control'] });
  const opener = page.getByRole('button', { name: 'Preview page 2 from inspect.pdf', exact: true });
  await opener.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'Page preview', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Page 2 / 12', { exact: true })).toBeVisible();
  for (let press = 0; press < 12; press += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await expect(page.locator('article.selected')).toHaveCount(2);
  await expect(page.locator('article').nth(0)).toHaveClass(/selected/);
  await expect(page.locator('article').nth(2)).toHaveClass(/selected/);

  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByText('Page 3 / 12', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(dialog.getByText('Page 2 / 12', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await expect(page.locator('article.selected')).toHaveCount(2);
});

test('full-page preview enforces zoom limits and rotates only the viewed page', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await pdfFile('rotated-preview.pdf', [200, 300, 400], 90));
  await expectThumbnails(page, 3);
  await page.getByRole('button', { name: 'Select page 1 from rotated-preview.pdf', exact: true }).click();
  await page.getByRole('button', { name: 'Select page 3 from rotated-preview.pdf', exact: true }).click({ modifiers: ['Control'] });
  await page.getByRole('button', { name: 'Preview page 2 from rotated-preview.pdf', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Page preview', exact: true });
  const image = dialog.getByRole('img', { name: 'Preview of page 2 from rotated-preview.pdf', exact: true });
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 260)).toBe(true);
  await expect(dialog.getByText('100%', { exact: true })).toBeVisible();

  const zoomOut = dialog.getByRole('button', { name: 'Zoom out', exact: true });
  await zoomOut.click();
  await zoomOut.click();
  await expect(dialog.getByText('50%', { exact: true })).toBeVisible();
  await expect(zoomOut).toBeDisabled();
  const zoomIn = dialog.getByRole('button', { name: 'Zoom in', exact: true });
  for (let i = 0; i < 6; i += 1) await zoomIn.click();
  await expect(dialog.getByText('200%', { exact: true })).toBeVisible();
  await expect(zoomIn).toBeDisabled();
  await dialog.getByRole('button', { name: 'Fit page', exact: true }).click();
  await expect(dialog.getByText('100%', { exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: 'Rotate previewed page right', exact: true }).click();
  await expect(dialog.getByText('Page 2 / 3', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(page.locator('article.selected')).toHaveCount(2);
  await expect(page.locator('article').nth(0).locator('.meta')).not.toContainText('90°');
  await expect(page.locator('article').nth(1).locator('.meta')).toContainText('90°');
  await expect(page.locator('article').nth(2).locator('.meta')).not.toContainText('90°');

  const output = await exportPdf(page);
  expect(output.getPages().map(outputPage => outputPage.getRotation().angle)).toEqual([90, 180, 90]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('article').nth(1).locator('.meta')).not.toContainText('90°');
});

test('full-page preview discards stale renders during rapid navigation and repeated close', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await pdfFile('rapid.pdf', [300, 700, 1_100, 1_500]));
  await expectThumbnails(page, 4);
  await page.evaluate(() => {
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    (window as unknown as { previewUrlCounts: { created: number; revoked: number } }).previewUrlCounts = { created: 0, revoked: 0 };
    URL.createObjectURL = blob => {
      (window as unknown as { previewUrlCounts: { created: number; revoked: number } }).previewUrlCounts.created += 1;
      return originalCreate(blob);
    };
    URL.revokeObjectURL = url => {
      (window as unknown as { previewUrlCounts: { created: number; revoked: number } }).previewUrlCounts.revoked += 1;
      originalRevoke(url);
    };
  });
  const opener = page.getByRole('button', { name: 'Preview page 1 from rapid.pdf', exact: true });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Page preview', exact: true });
    await dialog.getByRole('button', { name: 'Next page', exact: true }).click();
    await dialog.getByRole('button', { name: 'Next page', exact: true }).click();
    await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await dialog.getByRole('button', { name: 'Close preview', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  }
  await opener.click();
  const settledDialog = page.getByRole('dialog', { name: 'Page preview', exact: true });
  await expect(settledDialog.getByRole('img', { name: 'Preview of page 1 from rapid.pdf', exact: true })).toBeVisible();
  await settledDialog.getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(settledDialog).not.toBeVisible();
  expect(errors).toEqual([]);
  await expect.poll(() => page.evaluate(
    () => (window as unknown as { previewUrlCounts: { created: number; revoked: number } }).previewUrlCounts.created,
  )).toBeGreaterThan(0);
  const urlCounts = await page.evaluate(
    () => (window as unknown as { previewUrlCounts: { created: number; revoked: number } }).previewUrlCounts,
  );
  expect(urlCounts.created).toBeGreaterThan(0);
  expect(urlCounts.revoked, JSON.stringify(urlCounts)).toBe(urlCounts.created);
});

test('zoomed preview keeps arrow keys available for horizontal scrolling', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await pdfFile('wide.pdf', [2_000, 2_100]));
  await expectThumbnails(page, 2);
  await page.getByRole('button', { name: 'Preview page 1 from wide.pdf', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Page preview', exact: true });
  const image = dialog.getByRole('img', { name: 'Preview of page 1 from wide.pdf', exact: true });
  await expect(image).toBeVisible();
  for (let i = 0; i < 4; i += 1) await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(dialog.getByText('200%', { exact: true })).toBeVisible();
  const viewport = dialog.getByLabel('Scrollable page preview', { exact: true });
  await expect.poll(() => viewport.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  await viewport.focus();
  await page.keyboard.press('ArrowRight');

  await expect(dialog.getByText('Page 1 / 2', { exact: true })).toBeVisible();
  await expect.poll(() => viewport.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
});

test('full-page preview reports render failure and retries without losing navigation', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await pdfFile('retry.pdf', [300, 400]));
  await expectThumbnails(page, 2);
  await page.evaluate(() => {
    const canvasPrototype = HTMLCanvasElement.prototype as HTMLCanvasElement & {
      previewOriginalToBlob?: HTMLCanvasElement['toBlob'];
    };
    canvasPrototype.previewOriginalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); };
  });
  await page.getByRole('button', { name: 'Preview page 1 from retry.pdf', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Page preview', exact: true });
  await expect(dialog.getByRole('alert')).toContainText('We couldn’t render this page.');
  await dialog.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(dialog.getByText('Page 2 / 2', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('We couldn’t render this page.');
  await page.evaluate(() => {
    const canvasPrototype = HTMLCanvasElement.prototype as HTMLCanvasElement & {
      previewOriginalToBlob?: HTMLCanvasElement['toBlob'];
    };
    HTMLCanvasElement.prototype.toBlob = canvasPrototype.previewOriginalToBlob!;
  });
  await dialog.getByRole('button', { name: 'Retry preview', exact: true }).click();
  await expect(dialog.getByRole('img', { name: 'Preview of page 2 from retry.pdf', exact: true })).toBeVisible();
});

test('long export reports progress and can be cancelled without losing the workspace', async ({ page }) => {
  const pageCount = 30;
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.route(/\/assets\/PdfExport\.worker-.*\.js$/, async route => {
    await new Promise(resolve => setTimeout(resolve, 1_000));
    await route.continue();
  });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await pdfFile(
    'large-synthetic.pdf',
    Array.from({ length: pageCount }, (_, index) => 200 + (index % 100)),
  ));
  await expect(page.locator('article')).toHaveCount(pageCount, { timeout: renderTimeout });

  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Creating PDF' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel export' }).click();

  await expect(page.getByText('Export cancelled. Your workspace is still here.', { exact: true })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(pageCount);
  await expect(page.getByRole('button', { name: 'Save PDF', exact: true })).toBeEnabled();
  await page.waitForTimeout(500);
  expect(downloads).toBe(0);
});

test('large page grids defer off-screen thumbnails while keeping every page editable', async ({ page }) => {
  const pageCount = 100;
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(await pdfFile(
    'many-pages.pdf',
    Array.from({ length: pageCount }, (_, index) => 200 + index),
  ));
  await expect(page.locator('article')).toHaveCount(pageCount, { timeout: renderTimeout });
  await expect(page.locator('article .page-thumbnail img').first()).toBeVisible({ timeout: renderTimeout });
  await page.waitForTimeout(500);
  expect(await page.locator('article .page-thumbnail img').count()).toBeLessThan(50);

  const lastCard = page.locator('article').last();
  await lastCard.scrollIntoViewIfNeeded();
  await expect(lastCard.locator('.page-thumbnail img')).toBeVisible({ timeout: renderTimeout });
  await page.getByRole('button', { name: 'Select page 100 from many-pages.pdf', exact: true }).click();
  await expect(page.locator('article.selected')).toHaveAttribute('aria-label', 'Page 100 from many-pages.pdf');
  await page.getByRole('button', { name: 'Move page 100 left', exact: true }).click();
  await expect(page.locator('article.selected')).toHaveAttribute('aria-label', 'Page 99 from many-pages.pdf');
});

test('mixes PNG, JPEG, WebP and PDF without non-static network requests', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('The network privacy check requires a configured base URL');
  const expectedOrigin = new URL(baseURL).origin;
  const violations: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    if (url.origin !== expectedOrigin || request.method() !== 'GET' || url.search ||
        !(url.pathname === '/' || url.pathname === '/app-icon.svg' ||
          url.pathname.startsWith('/assets/') || url.pathname.startsWith('/mascots/'))) {
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
  for (let index = 0; index < files.length; index += 1) {
    await page.getByRole('button', { name: `Preview page ${index + 1} from ${files[index].name}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Page preview', exact: true });
    const image = dialog.getByRole('img', { name: `Preview of page ${index + 1} from ${files[index].name}`, exact: true });
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && Math.max(node.naturalWidth, node.naturalHeight) > 500)).toBe(true);
    await dialog.getByRole('button', { name: 'Close preview', exact: true }).click();
  }
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
  await page.locator('article .page-thumbnail').click();
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose files', exact: true })).toBeInViewport();
  await expect(page.getByText('PDF · JPG / JPEG · PNG · WebP', { exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const brandLink = page.getByRole('link', { name: 'Visit quackandhonk.com (opens in a new tab)', exact: true });
  await brandLink.scrollIntoViewIfNeeded();
  await expect(brandLink).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('input[type=file]').setInputFiles(await pdfFile('mobile.pdf', [111, 222]));
  await expectThumbnails(page, 2);
  const toolbarMetrics = await page.locator('.toolbar').evaluate(toolbar => ({
    height: toolbar.getBoundingClientRect().height,
    rowCount: new Set([...toolbar.querySelectorAll('button, output')]
      .map(control => control.getBoundingClientRect().top)).size,
    minimumControlHeight: Math.min(...[...toolbar.querySelectorAll('button, output')]
      .map(control => control.getBoundingClientRect().height)),
  }));
  expect(toolbarMetrics.height).toBeLessThanOrEqual(220);
  expect(toolbarMetrics.rowCount).toBe(4);
  expect(toolbarMetrics.minimumControlHeight).toBeGreaterThanOrEqual(42);
  const firstSelection = page.getByRole('checkbox', { name: 'Add page 1 from mobile.pdf to selection', exact: true });
  await page.getByRole('button', { name: 'Drag page 1 to reorder', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(firstSelection).toBeFocused();
  expect(await firstSelection.evaluate(input => {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return false;
    const inputRect = input.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    return inputRect.top >= toolbarRect.bottom + 8 &&
      document.elementFromPoint(inputRect.left + inputRect.width / 2, inputRect.top + inputRect.height / 2) === input;
  })).toBe(true);
  await page.keyboard.press('Space');
  await page.getByRole('checkbox', { name: 'Add page 2 from mobile.pdf to selection', exact: true }).check();
  await expect(page.getByRole('status', { name: 'Selected pages', exact: true })).toHaveText('2 of 2 selected');
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click();
  await page.getByRole('button', { name: 'Preview page 1 from mobile.pdf', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Page preview', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close preview', exact: true })).toBeInViewport();
  const viewport = dialog.getByLabel('Scrollable page preview', { exact: true });
  await viewport.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close preview', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(viewport).toBeFocused();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Close preview', exact: true }).click();
  await page.getByRole('button', { name: 'Move page 2 left', exact: true }).click();
  const output = await exportPdf(page);
  expect(output.getPages().map(p => p.getWidth())).toEqual([222, 111]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
