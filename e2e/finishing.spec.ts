import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createPdfToolkit } from 'pdfstudio';

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

async function downloadBytes(page: Page, button = 'Save PDF') {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  const bytes = await readFile((await file.path())!);
  await writeFile(test.info().outputPath(`export-${Date.now()}.pdf`), bytes);
  await test.info().attach('export.pdf', { body: bytes, contentType: 'application/pdf' });
  return bytes;
}
async function download(page: Page, button = 'Save PDF') { return PDFDocument.load(await downloadBytes(page, button)); }

async function texts(pdf: PDFDocument) {
  const task = getDocument({ data: Uint8Array.from(await pdf.save()), standardFontDataUrl: fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)).replace(/\\/g, '/') });
  try {
    const document = await task.promise;
    const result: string[][] = [];
    for (let index = 1; index <= document.numPages; index++) {
      const content = await (await document.getPage(index)).getTextContent();
      result.push(content.items.flatMap(item => 'str' in item ? [item.str] : []));
    }
    return result;
  } finally { await task.destroy(); }
}

test('advanced numbering and Thai watermark survive real preview and rotated-page export', async ({ page }) => {
  const requests: { url: string; method: string; data: string | null }[] = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), data: request.postData() }));
  await importFixture(page);
  await page.getByText('Page numbers · Off', { exact: true }).click();
  await page.getByLabel('Add page numbers', { exact: true }).check();
  await page.getByLabel('Advanced: number sections separately', { exact: true }).check();
  const first = page.getByRole('group', { name: 'Section 1', exact: true });
  await first.getByLabel('To output page').fill('2');
  await first.getByLabel('Number system').selectOption('roman-lower');
  await page.getByRole('button', { name: 'Add section', exact: true }).click();
  await page.getByText('Watermark · Off', { exact: true }).click();
  await page.getByLabel('Add text watermark', { exact: true }).check();
  await page.getByLabel('Watermark text', { exact: true }).fill('สำเนา');
  await page.getByLabel('Watermark size (pt)', { exact: true }).fill('24');
  await page.getByRole('button', { name: 'Preview export', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Export preview', exact: true });
  await expect(preview.getByRole('img')).toBeVisible({ timeout: 15_000 });
  await preview.getByRole('button', { name: 'Next →', exact: true }).click();
  await expect(preview.getByRole('img')).toHaveAttribute('alt', 'Export preview of output page 2');
  await preview.getByRole('button', { name: 'Close', exact: true }).click();
  const content = await texts(await download(page));
  expect(content.map(items => items.filter(item => ['i', 'ii', '1', '2'].includes(item)))).toEqual([['i'], ['ii'], ['1'], ['2']]);
  // Font shaping may use the equivalent decomposed sara-am sequence. This
  // comparison still rejects duplicated vowels (the original regression).
  expect(content.map(items => items.join('').normalize('NFKC'))).toEqual(Array.from({ length: 4 }, () => expect.stringContaining('สำเนา'.normalize('NFKC'))));
  expect(requests.some(request => /NotoSansThaiLooped.+\.ttf/.test(request.url))).toBe(true);
  for (const request of requests.filter(request => request.url.startsWith('http'))) {
    expect(new URL(request.url).origin).toBe(new URL(page.url()).origin);
    expect(request.method).toBe('GET'); expect(request.data).toBeNull(); expect(new URL(request.url).search).toBe('');
  }
});

test('selected output recalculates alphabet numbering and total after reordering and duplicate copies stay independent', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Select page 1 from finishing.pdf', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await page.getByRole('button', { name: 'Move page 2 left', exact: true }).click();
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Add page 1 from finishing.pdf to selection', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Add page 2 from finishing.pdf to selection', exact: true }).check();
  await page.getByText('Page numbers · Off', { exact: true }).click();
  await page.getByLabel('Add page numbers', { exact: true }).check();
  await page.getByLabel('Starting value', { exact: true }).fill('26');
  await page.getByRole('combobox', { name: 'Number system', exact: true }).selectOption('latin-lower');
  await page.getByText('Position and appearance', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Number format', exact: true }).selectOption('number-total');
  expect((await texts(await download(page, 'Save 2 selected pages'))).map(items => items.at(-1))).toEqual(['z / 2', 'aa / 2']);
  await page.getByLabel('Starting value', { exact: true }).fill('41');
  await page.getByRole('combobox', { name: 'Number system', exact: true }).selectOption('thai');
  expect((await texts(await download(page, 'Save 2 selected pages'))).map(items => items.at(-1))).toEqual(['ฮ / 2', 'กก / 2']);
  await page.getByLabel('Start on output page', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save 2 selected pages', exact: true }).click();
  await expect(page.locator('.save-panel [role=alert]')).toBeVisible();
  await expect(page.locator('article')).toHaveCount(5);
});

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

test('shortcuts edit and save pages but preserve native editing and modal safeguards', async ({ page }) => {
  await importFixture(page);
  await page.keyboard.press('Control+a');
  await expect(page.locator('article.selected')).toHaveCount(4);
  await page.keyboard.press('Delete');
  await expect(page.locator('article')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('article')).toHaveCount(4);
  await page.keyboard.press('Control+d');
  await expect(page.locator('article')).toHaveCount(8);
  await page.keyboard.press('Control+z');
  await expect(page.locator('article')).toHaveCount(4);
  await page.getByRole('button', { name: 'Crop', exact: true }).click();
  await page.getByLabel('Top (%)', { exact: true }).fill('15');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await expect(page.getByLabel('Top (%)', { exact: true })).toHaveValue('');
  await expect(page.locator('article')).toHaveCount(4);
  await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('article')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('article.selected')).toHaveCount(0);
  const pending = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  expect((await PDFDocument.load(await readFile((await (await pending).path())!))).getPageCount()).toBe(4);
  await page.getByRole('checkbox', { name: 'Require a password to open the saved PDF' }).check();
  const password = page.getByLabel('New PDF password', { exact: true });
  await password.fill('abc');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await expect(password).toHaveValue('');
  await expect(page.locator('article')).toHaveCount(4);
});

test('compression levels preserve numbered text and crop, reduce eligible images and run before password protection', async ({ page }) => {
  await page.goto('/');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 700;
    const ctx = canvas.getContext('2d')!; const pixels = ctx.createImageData(900, 700);
    for (let y = 0; y < 700; y++) for (let x = 0; x < 900; x++) {
      const offset = (y * 900 + x) * 4;
      pixels.data[offset] = (x * 13 + y * 7 + x * y % 251) & 255;
      pixels.data[offset + 1] = (x * 3 + y * 17 + (x ^ y)) & 255;
      pixels.data[offset + 2] = (x * 19 + y * 5 + x * y % 137) & 255;
      pixels.data[offset + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0); return canvas.toDataURL('image/png');
  });
  const source = await PDFDocument.create(); const p = source.addPage([612, 792]);
  p.setCropBox(12, 23, 500, 700); p.setRotation(degrees(90));
  p.drawImage(await source.embedPng(png), { x: 30, y: 100, width: 450, height: 400 });
  p.drawText('Selectable synthetic text', { x: 50, y: 650, size: 16 });
  await page.locator('input[type=file]').setInputFiles({ name: 'compression.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await source.save()) });
  await page.getByText('Page numbers · Off', { exact: true }).click();
  await page.getByLabel('Add page numbers', { exact: true }).check();
  await page.getByText('Compression', { exact: true }).click();
  const outputs = new Map<string, Buffer>();
  for (const level of ['off', 'lossless', 'balanced', 'small']) {
    await page.getByRole('combobox', { name: 'Compression level', exact: true }).selectOption(level);
    const bytes = await downloadBytes(page); outputs.set(level, bytes);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPage(0).getCropBox()).toEqual({ x: 12, y: 23, width: 500, height: 700 });
    expect(pdf.getPage(0).getRotation().angle).toBe(90);
    const content = (await texts(pdf))[0];
    expect(content.join('')).toContain('Selectable synthetic text'); expect(content).toContain('1');
  }
  expect(outputs.get('lossless')!.length).toBeLessThanOrEqual(outputs.get('off')!.length);
  expect(outputs.get('balanced')!.length).toBeLessThan(outputs.get('lossless')!.length * 0.6);
  expect(outputs.get('small')!.length).toBeLessThan(outputs.get('balanced')!.length * 0.85);
  await page.getByRole('checkbox', { name: 'Require a password to open the saved PDF' }).check();
  await page.getByLabel('New PDF password', { exact: true }).fill('local-finish-test');
  await page.getByLabel('Confirm password', { exact: true }).fill('local-finish-test');
  const protectedBytes = await downloadBytes(page);
  const toolkit = await createPdfToolkit();
  await expect(toolkit.unlock(protectedBytes, { password: 'wrong' })).rejects.toThrow();
  const reopened = await PDFDocument.load(await toolkit.unlock(protectedBytes, { password: 'local-finish-test' }));
  expect((await texts(reopened))[0]).toContain('1');
  expect(protectedBytes.length).toBeLessThan(outputs.get('balanced')!.length);
});

test('failed font and compression jobs are visible and retryable, cancelled compression never downloads', async ({ page }) => {
  await importFixture(page);
  let downloads = 0; page.on('download', () => downloads++);
  await page.getByText('Page numbers · Off', { exact: true }).click();
  await page.getByLabel('Add page numbers', { exact: true }).check();
  await page.route('**/*NotoSansThaiLooped*.ttf', route => route.abort());
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible(); expect(downloads).toBe(0);
  await page.unroute('**/*NotoSansThaiLooped*.ttf');
  expect((await download(page)).getPageCount()).toBe(4);
  await page.getByText('Compression', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Compression level', exact: true }).selectOption('balanced');
  await page.route('**/*qpdf*.wasm', route => route.abort());
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible(); expect(downloads).toBe(1);
  await page.unroute('**/*qpdf*.wasm');
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/*qpdf*.wasm', async route => { await held; await route.continue().catch(() => {}); });
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  await expect(page.getByText('Compressing your PDF…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel export', exact: true }).click();
  await expect(page.getByText('Export cancelled. Your workspace is still here.', { exact: true })).toBeVisible();
  release(); await page.unroute('**/*qpdf*.wasm'); expect(downloads).toBe(1);
  expect((await download(page)).getPageCount()).toBe(4);
  expect(downloads).toBe(2);
});

test('image crop rotates with content and survives recovery with matching thumbnail and exported geometry', async ({ page }) => {
  await page.goto('/');
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 200;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#c84a30'; context.fillRect(0, 0, 200, 200);
    context.fillStyle = '#245a40'; context.fillRect(200, 0, 200, 200);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'crop-image.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await page.getByRole('button', { name: 'Select page 1 from crop-image.png', exact: true }).click();
  await page.getByRole('button', { name: 'Crop', exact: true }).click();
  await page.getByLabel('Top (%)', { exact: true }).fill('25');
  await page.getByLabel('Left (%)', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Apply to 1 pages', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  const thumbnail = page.locator('.page-thumbnail img');
  await expect.poll(() => thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth / image.naturalHeight)).toBeCloseTo(0.5, 2);
  await page.getByRole('checkbox', { name: 'Remember work on this device', exact: true }).check();
  await expect(page.getByTestId('recovery-status')).toHaveText('Saved on this device');
  await page.reload();
  await page.getByRole('button', { name: 'Restore saved work', exact: true }).click();
  const output = (await download(page)).getPage(0);
  expect(output.getCropBox()).toEqual({ x: 100, y: 0, width: 300, height: 150 });
  expect(output.getMediaBox()).toEqual({ x: 0, y: 0, width: 400, height: 200 });
  expect(output.getRotation().angle).toBe(90);
  await page.getByRole('button', { name: 'Preview page 1 from crop-image.png', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Page preview', exact: true }).getByRole('img');
  await expect(preview).toBeVisible();
  expect(await preview.evaluate((image: HTMLImageElement) => image.naturalWidth / image.naturalHeight)).toBeCloseTo(0.5, 2);
});

test('Thai controls, validation, preview, keyboard editing and language preference work at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await importFixture(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('th');
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.getByRole('heading', { name: 'เอกสารของคุณ', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'เลือกหน้า 1 จาก finishing.pdf', exact: true }).click();
  await page.keyboard.press('Delete'); await expect(page.locator('article')).toHaveCount(3);
  await page.keyboard.press('Control+z'); await expect(page.locator('article')).toHaveCount(4);
  await page.getByRole('button', { name: 'ครอบตัด', exact: true }).click();
  const crop = page.getByRole('dialog', { name: 'ครอบตัดหน้าที่เลือก', exact: true });
  await crop.getByLabel('ด้านบน (%)', { exact: true }).fill('10');
  await crop.getByRole('button', { name: 'ใช้กับ 1 หน้า', exact: true }).click();
  await page.getByText('เลขหน้า · ปิด', { exact: true }).click();
  await page.getByLabel('เพิ่มเลขหน้า', { exact: true }).check();
  await page.getByLabel('ค่าเริ่มต้น', { exact: true }).fill('27');
  await page.getByRole('combobox', { name: 'ระบบเลขหน้า', exact: true }).selectOption('latin-lower');
  await expect(page.getByText('ตัวอย่าง: aa', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ดูตัวอย่างไฟล์ส่งออก', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'ตัวอย่างไฟล์ส่งออก', exact: true });
  await expect(preview.getByRole('img')).toBeVisible({ timeout: 15_000 });
  expect(await preview.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByLabel('ค่าเริ่มต้น', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'บันทึก PDF', exact: true }).click();
  await expect(page.locator('.save-panel [role=alert]')).toHaveText('ค่าเริ่มต้นของช่วงต้องเป็นจำนวนเต็มบวกที่รองรับ');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => ({ keys: Object.keys(localStorage), language: localStorage.getItem('qh-pdf-language') }))).toEqual({ keys: ['qh-pdf-language'], language: 'th' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'เลือกไฟล์', exact: true })).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await page.getByRole('combobox', { name: 'ภาษา', exact: true }).selectOption('en');
  await expect(page.getByRole('button', { name: 'Choose files', exact: true })).toBeEnabled();
});
