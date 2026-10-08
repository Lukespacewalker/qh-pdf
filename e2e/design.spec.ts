import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test('desktop homepage starts with a full-width PDF import and explains the tools below', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Add PDFs or images');
  const chooser = page.getByRole('button', { name: 'Choose files', exact: true });
  await expect(chooser).toBeEnabled();
  await expect(chooser).toBeInViewport();
  const content = await page.locator('.workspace-content').boundingBox();
  const explanation = await page.locator('.capabilities').boundingBox();
  const drop = await page.locator('.drop').boundingBox();
  expect(content).not.toBeNull();
  expect(explanation).not.toBeNull();
  expect(drop).not.toBeNull();
  expect(drop!.x).toBeCloseTo(content!.x, 0);
  expect(drop!.width).toBeCloseTo(content!.width, 0);
  expect(explanation!.y).toBeGreaterThanOrEqual(drop!.y + drop!.height);
  await expect(page.getByRole('heading', { name: 'Merge and organize PDFs', exact: true })).toBeVisible();

  // Keyboard activation proves the prominent control opens the real input.
  await chooser.focus();
  const pendingChooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  const fileChooser = await pendingChooser;
  const pdf = await PDFDocument.create();
  pdf.addPage([240, 360]);
  await fileChooser.setFiles({ name: 'welcome.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your document');
  await expect(page.getByRole('button', { name: 'Save PDF', exact: true })).toBeEnabled();
});

for (const width of [320, 390, 768]) {
  test(`homepage at ${width}px keeps import and formats visible without overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Add PDFs or images');
    const chooser = page.getByRole('button', { name: 'Choose files', exact: true });
    await expect(chooser).toBeEnabled();
    await expect(chooser).toBeInViewport();
    await expect(page.getByText('PDF · JPG / JPEG · PNG · WebP', { exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await chooser.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('link', { name: 'Visit Quack & Honk (opens in a new tab)' }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('compact header switches language with the keyboard and keeps Thai import visible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  const thai = page.getByRole('button', { name: 'ไทย', exact: true });
  const english = page.getByRole('button', { name: 'EN', exact: true });
  for (const button of [thai, english]) {
    const bounds = (await button.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  await expect(english).toHaveAttribute('aria-pressed', 'true');
  await thai.focus();
  await page.keyboard.press('Enter');
  await expect(thai).toHaveAttribute('aria-pressed', 'true');
  await expect(english).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('เพิ่ม PDF หรือรูปภาพ');
  await expect(page.getByRole('button', { name: 'เลือกไฟล์', exact: true })).toBeInViewport();
  await expect(page.getByText('PDF · JPG / JPEG · PNG · WebP', { exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await expect(thai).toHaveAttribute('aria-pressed', 'true');
  await english.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Add PDFs or images');
});

test('editorial fonts decode from same-origin bundled assets', async ({ page, baseURL }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('.woff2')) requests.push(request.url()); });
  await page.goto('/');
  const fonts = await page.evaluate(async () => {
    const display = await document.fonts.load('40px "DM Serif Display"');
    const body = await document.fonts.load('16px "DM Sans"');
    return { display: display.length, body: body.length, loaded: [...display, ...body].every(font => font.status === 'loaded') };
  });
  expect(fonts.display).toBeGreaterThan(0);
  expect(fonts.body).toBeGreaterThan(0);
  expect(fonts.loaded).toBe(true);
  expect(requests.length).toBeGreaterThanOrEqual(2);
  for (const request of requests) {
    const url = new URL(request);
    expect(url.origin).toBe(new URL(baseURL!).origin);
    expect(url.pathname).toMatch(/^\/assets\/.*\.woff2$/);
    expect(url.search).toBe('');
  }
});

test('warm workspace keeps long filenames and page actions usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  const pdf = await PDFDocument.create();
  pdf.addPage([240, 360]);
  pdf.addPage([300, 360]);
  const name = `${'a-long-document-name-'.repeat(8)}.pdf`;
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await expect(page.locator('article')).toHaveCount(2);
  const card = page.locator('article').first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole('button', { name: `Preview page 1 from ${name}`, exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Move page 1 right', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Move page 1 right', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save PDF', exact: true })).toBeEnabled();
});

test('homepage remains readable and usable with 200 percent content zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const chooser = page.getByRole('button', { name: 'Choose files', exact: true });
  await expect(chooser).toBeEnabled();
  await chooser.scrollIntoViewIfNeeded();
  await expect(chooser).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('mobile save and recovery controls have full touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const pdf = await PDFDocument.create();
  pdf.addPage([240, 360]);
  await page.locator('input[type=file]').setInputFiles({ name: 'touch-targets.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await expect(page.locator('article')).toHaveCount(1);
  const shortcuts = page.locator('.shortcut-help > summary');
  expect((await shortcuts.boundingBox())!.height).toBeGreaterThanOrEqual(42);
  await shortcuts.click();
  await expect(page.locator('.shortcut-help dl')).toBeVisible();
  await shortcuts.click();
  await expect(page.locator('.shortcut-help dl')).toBeHidden();
  const protect = page.getByRole('checkbox', { name: 'Require a password to open the saved PDF', exact: true });
  const recovery = page.getByRole('checkbox', { name: 'Remember work on this device', exact: true });
  for (const checkbox of [protect, recovery]) {
    expect(await checkbox.evaluate(node => node.closest('label')!.getBoundingClientRect().height)).toBeGreaterThanOrEqual(42);
  }
  await recovery.check();
  await expect(page.getByTestId('recovery-status')).toHaveText('Saved on this device');
  const clear = page.getByRole('button', { name: 'Clear saved work', exact: true });
  expect((await clear.boundingBox())!.height).toBeGreaterThanOrEqual(42);
  await clear.click();
  await expect(page.getByTestId('recovery-status')).toHaveText('Saved copy cleared. Recovery is off.');
  await expect(page.locator('article')).toHaveCount(1);
});

test('recovery guidance stays visible while its details can be opened with the keyboard', async ({ page }) => {
  await page.goto('/');
  const recovery = page.getByRole('checkbox', { name: 'Remember work on this device', exact: true });
  const guidance = page.getByText('If enabled, source files and page edits stay in this browser until cleared. Anyone using this browser can restore unprotected files.', { exact: true });
  const details = page.locator('.recovery-details');
  const summary = details.locator('summary');
  await expect(guidance).toBeVisible();
  await expect(recovery).not.toBeChecked();
  await expect(page.getByTestId('recovery-status')).toBeVisible();
  await expect(details.locator('p')).toBeHidden();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(details.locator('p')).toBeVisible();
  await expect(details.locator('p')).toContainText('passwords and unlocked copies are never saved');
  await expect(recovery).not.toBeChecked();
  await page.keyboard.press('Enter');
  await expect(details.locator('p')).toBeHidden();
  await expect(guidance).toBeVisible();
  await expect(page.getByTestId('recovery-status')).toBeVisible();
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();
  await expect(summary).toHaveText('รายละเอียดการจดจำงาน');
  await expect(guidance).toHaveCount(0);
  await expect(page.locator('#recovery-guidance')).toHaveText('เมื่อเปิดใช้ จะเก็บไฟล์ต้นฉบับและการแก้ไขหน้าไว้ในเบราว์เซอร์จนกว่าจะล้าง ผู้ใช้เบราว์เซอร์นี้กู้คืนไฟล์ที่ไม่ได้ป้องกันได้');
});
