import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { createPdfToolkit } from 'pdfstudio';
import { passwordPdf } from './helpers/passwordPdf';

const importTimeout = 15_000;

test('protected import retries, cancels safely, and exports a password-protected PDF without external requests', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('A base URL is required');
  const violations: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    if (url.origin !== new URL(baseURL).origin || request.method() !== 'GET' || url.search || request.postData() ||
        !(url.pathname === '/' || url.pathname === '/app-icon.svg' ||
          url.pathname.startsWith('/assets/') || url.pathname.startsWith('/mascots/'))) violations.push(url.pathname);
  });
  const file = await passwordPdf();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('PDF password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Unlock PDF' }).click();
  await expect(page.getByRole('alert')).toContainText('didn’t open');
  await page.getByLabel('PDF password', { exact: true }).fill('fixture-secret');
  await page.getByRole('button', { name: 'Unlock PDF' }).click();
  await expect(page.locator('article')).toHaveCount(2, { timeout: importTimeout });
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: 'Cancel import' }).click();
  await expect(page.locator('article')).toHaveCount(2);
  await page.locator('article .preview').first().click();
  await page.getByRole('button', { name: 'Rotate right' }).click();
  await page.getByRole('button', { name: 'Move page 2 left' }).click();
  await page.getByLabel('Require a password to open the saved PDF').check();
  const newPassword = 'ทดสอบ 🔐 secure';
  await page.getByLabel('New PDF password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm password', { exact: true }).fill('different');
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');
  await page.getByLabel('Confirm password', { exact: true }).fill(newPassword);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  const download = await pending;
  const bytes = await readFile((await download.path())!);
  const toolkit = await createPdfToolkit();
  await expect(toolkit.unlock(bytes, { password: 'wrong' })).rejects.toThrow();
  const decoded = await toolkit.unlock(bytes, { password: newPassword });
  const pdf = await PDFDocument.load(decoded);
  expect(pdf.getPages().map(p => [p.getWidth(), p.getRotation().angle])).toEqual([[222, 90], [111, 180]]);
  await expect(page.getByLabel('New PDF password', { exact: true })).toHaveValue('');
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('recovery stores encrypted originals and asks for their password again after reload', async ({ page }) => {
  const file = await passwordPdf();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose files' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByLabel('PDF password', { exact: true }).fill('fixture-secret');
  await page.getByRole('button', { name: 'Unlock PDF' }).click();
  await expect(page.locator('article')).toHaveCount(2, { timeout: importTimeout });
  await page.getByLabel('Remember work on this device').check();
  await expect(page.getByTestId('recovery-status')).toHaveText('Saved on this device');
  const stored = await page.evaluate(async () => new Promise<{ fields: string[]; bytes: number[] }>((resolve, reject) => {
    const request = indexedDB.open('qh-pdf-recovery', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('workspaces', 'readonly');
      const value = transaction.objectStore('workspaces').get('current');
      transaction.oncomplete = () => {
        const doc = value.result.snapshot.documents[0];
        resolve({ fields: Object.keys(doc).sort(), bytes: Array.from(new Uint8Array(doc.bytes)) });
        db.close();
      };
    };
  }));
  expect(stored.fields).toEqual(['bytes', 'fileName', 'id', 'mimeType']);
  expect(Buffer.from(stored.bytes)).toEqual(file.buffer);
  await page.reload();
  await page.getByRole('button', { name: 'Restore saved work' }).click();
  await expect(page.getByLabel('PDF password', { exact: true })).toHaveValue('');
  await page.getByLabel('PDF password', { exact: true }).fill('fixture-secret');
  await page.getByRole('button', { name: 'Unlock PDF' }).click();
  await expect(page.locator('article')).toHaveCount(2, { timeout: importTimeout });
  await expect(page.getByLabel('Require a password to open the saved PDF')).not.toBeChecked();
});
