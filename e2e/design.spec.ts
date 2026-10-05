import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test('desktop homepage makes the file picker the primary action in the selected split layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bring your pages together.');
  const chooser = page.getByRole('button', { name: 'Choose files', exact: true });
  await expect(chooser).toBeEnabled();
  await expect(chooser).toBeInViewport();
  const copy = await page.locator('.welcome-copy').boundingBox();
  const drop = await page.locator('.drop').boundingBox();
  expect(copy).not.toBeNull();
  expect(drop).not.toBeNull();
  expect(drop!.x).toBeGreaterThanOrEqual(copy!.x + copy!.width);

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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bring your pages together.');
    const chooser = page.getByRole('button', { name: 'Choose files', exact: true });
    await expect(chooser).toBeEnabled();
    await expect(chooser).toBeInViewport();
    await expect(page.getByText('PDF · JPG / JPEG · PNG · WebP', { exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await chooser.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('link', { name: 'Visit quackandhonk.com (opens in a new tab)' }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

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
