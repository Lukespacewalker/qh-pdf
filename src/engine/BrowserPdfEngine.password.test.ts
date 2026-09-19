import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { createPdfToolkit, type PdfToolkit } from 'pdfstudio';
import type { ImportedDocument } from './PdfEngine';

// Use the Node-compatible PDF.js renderer and the real local QPDF WASM.
// Only asset URLs differ from the browser build; encryption is never mocked.
// Node has no browser Worker, so run its real adapter directly here. Chromium
// tests exercise the built worker bridge; separate lifecycle tests cover failure.
vi.mock('./PdfSecurity', () => import('./QpdfAdapter'));
vi.mock('pdfjs-dist', () => import('pdfjs-dist/legacy/build/pdf.mjs'));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href,
}));
vi.mock('pdfstudio/qpdf.wasm?url', () => ({
  default: new URL('../../node_modules/pdfstudio/dist/wasm/qpdf.wasm', import.meta.url).href,
}));
vi.mock('./PdfExport', async () => {
  const { runPdfExportInProcess } = await import('./test/runPdfExportInProcess');
  return { runPdfExport: runPdfExportInProcess };
});
import { BrowserPdfEngine } from './BrowserPdfEngine';

let toolkit: PdfToolkit;
let plain: Uint8Array<ArrayBuffer>;
let encrypted: Uint8Array<ArrayBuffer>;
const password = 'fixture-secret';
const engine = new BrowserPdfEngine();
const file = (bytes: Uint8Array<ArrayBuffer>) => new File([bytes], 'synthetic-private.pdf', { type: 'application/pdf' });
const workspace = (doc: ImportedDocument) => ({
  pages: [
    { id: 'b', sourceDocumentId: doc.id, sourcePageIndex: 1, rotation: 90 as const },
    { id: 'a', sourceDocumentId: doc.id, sourcePageIndex: 0, rotation: 0 as const },
    { id: 'copy', sourceDocumentId: doc.id, sourcePageIndex: 1, rotation: 0 as const },
  ], selectedPageIds: [],
});

beforeAll(async () => {
  toolkit = await createPdfToolkit();
  const pdf = await PDFDocument.create();
  for (const width of [111, 222]) {
    const p = pdf.addPage([width, 400]);
    p.setRotation(degrees(90));
    p.drawRectangle({ x: 10, y: 20, width: 30, height: 40 });
  }
  plain = Uint8Array.from(await pdf.save());
  encrypted = Uint8Array.from(await toolkit.lock(plain, { userPassword: password, keyLength: 256 }));
});

describe('real password-protected PDFs', () => {
  it('asks for the password without exposing engine diagnostics', async () => {
    await expect(engine.importFile(file(encrypted))).rejects.toMatchObject({ code: 'password-protected' });
    await expect(engine.importFile(file(encrypted), { password: 'incorrect' }))
      .rejects.toMatchObject({ code: 'password-protected' });
  });

  it('unlocks with the correct password while keeping the original encrypted bytes', async () => {
    const original = encrypted.slice();
    const doc = await engine.importFile(file(encrypted), { password });
    expect(doc.encrypted).toBe(true);
    expect(new Uint8Array(doc.bytes)).toEqual(original);
    expect(doc.pages).toHaveLength(2);
    expect(doc.unlockedBytes).toBeDefined();
    expect((await PDFDocument.load(doc.unlockedBytes!)).getPageCount()).toBe(2);
    expect(Object.keys(doc)).not.toContain('password');
    for (let i = 0; i < 2; i++) {
      const output = await engine.exportWorkspace(new Map([[doc.id, doc]]), workspace(doc));
      const reopened = await PDFDocument.load(await output.arrayBuffer());
      expect(reopened.getPages().map(p => p.getWidth())).toEqual([222, 111, 222]);
      expect(reopened.getPages().map(p => p.getRotation().angle)).toEqual([180, 90, 90]);
    }
    expect(new Uint8Array(doc.bytes)).toEqual(original);
  });

  it('exports AES-256 that rejects missing/wrong passwords and reimports correctly', async () => {
    const doc = await engine.importFile(file(plain));
    const output = await engine.exportWorkspace(new Map([[doc.id, doc]]), workspace(doc), { password });
    const bytes = new Uint8Array(await output.arrayBuffer());
    const info = await toolkit.getInfo(bytes, { password });
    expect(info.encrypted).toBe(true);
    expect(info.encryption).toMatchObject({ bits: 256, method: 'AESv3' });
    await expect(engine.importFile(file(bytes))).rejects.toMatchObject({ code: 'password-protected' });
    await expect(engine.importFile(file(bytes), { password: 'wrong' })).rejects.toMatchObject({ code: 'password-protected' });
    const reopened = await engine.importFile(file(bytes), { password });
    const pdf = await PDFDocument.load(reopened.unlockedBytes!);
    expect(pdf.getPages().map(p => p.getWidth())).toEqual([222, 111, 222]);
    expect(pdf.getPages().map(p => p.getRotation().angle)).toEqual([180, 90, 90]);
  });

  it('round-trips a Unicode password including Thai without trimming spaces', async () => {
    const unicode = ' รหัสผ่าน-🔐-café ';
    const doc = await engine.importFile(file(plain));
    const output = await engine.exportWorkspace(new Map([[doc.id, doc]]), workspace(doc), { password: unicode });
    const bytes = new Uint8Array(await output.arrayBuffer());
    expect((await engine.importFile(file(bytes), { password: unicode })).pages).toHaveLength(3);
    await expect(engine.importFile(file(bytes), { password: unicode.trim() })).rejects.toMatchObject({ code: 'password-protected' });
  });

  it('accepts an encrypted PDF with an empty opening password', async () => {
    const bytes = Uint8Array.from(await toolkit.lock(plain, { userPassword: '', ownerPassword: 'owner-secret' }));
    const doc = await engine.importFile(file(bytes));
    expect(doc.encrypted).toBe(true);
    expect((await PDFDocument.load(doc.unlockedBytes!)).getPageCount()).toBe(2);
  });

  it('accepts either the user or owner password of an AES-128 input', async () => {
    const bytes = Uint8Array.from(await toolkit.lock(plain, {
      userPassword: 'reader', ownerPassword: 'owner', keyLength: 128,
    }));
    for (const password of ['reader', 'owner']) {
      const doc = await engine.importFile(file(bytes), { password });
      expect(doc.encrypted).toBe(true);
      expect((await PDFDocument.load(doc.unlockedBytes!)).getPageCount()).toBe(2);
    }
  });

  it.each(['', 'prefix\0suffix', 'x'.repeat(128), 'ก'.repeat(43)])('rejects unsafe export password %j', async invalid => {
    const doc = await engine.importFile(file(plain));
    await expect(engine.exportWorkspace(new Map([[doc.id, doc]]), workspace(doc), { password: invalid }))
      .rejects.toMatchObject({ code: 'export-failed' });
  });

  it('keeps a malformed PDF error separate from a password error', async () => {
    await expect(engine.importFile(file(new TextEncoder().encode('not a pdf')), { password }))
      .rejects.toMatchObject({ code: 'invalid-pdf' });
  });
});
