import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import type { ImportedDocument } from './PdfEngine';
import type { WorkspacePage } from '../domain/workspace';

// Only isolate the browser renderer at module initialization. Export tests
// below create, write and reopen real PDFs using the real pdf-lib engine.
vi.mock('pdfjs-dist', () => ({ getDocument: vi.fn(), GlobalWorkerOptions: {} }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/test-worker.mjs' }));
vi.mock('./PdfExport', async () => {
  const { runPdfExportInProcess } = await import('./test/runPdfExportInProcess');
  return { runPdfExport: runPdfExportInProcess };
});
import { BrowserPdfEngine } from './BrowserPdfEngine';

async function source(id: string, widths: number[], rotation = 0): Promise<ImportedDocument> {
  const pdf = await PDFDocument.create();
  widths.forEach(width => pdf.addPage([width, 400]).setRotation(degrees(rotation)));
  return {
    id, fileName: `${id}.pdf`, mimeType: 'application/pdf', kind: 'pdf',
    bytes: Uint8Array.from(await pdf.save()).buffer,
    pages: widths.map((width, sourcePageIndex) => ({ sourcePageIndex, width, height: 400 })),
  };
}
const page = (id: string, sourceDocumentId: string, sourcePageIndex = 0, rotation: WorkspacePage['rotation'] = 0): WorkspacePage =>
  ({ id, sourceDocumentId, sourcePageIndex, rotation });

let engine: BrowserPdfEngine;
beforeEach(() => { engine = new BrowserPdfEngine(); });

describe('real PDF export', () => {
  it('preserves source rotation and applies the additional workspace rotation', async () => {
    const doc = await source('rotated', [200], 90);
    const result = await engine.exportWorkspace(new Map([[doc.id, doc]]), {
      pages: [page('a', doc.id), page('b', doc.id, 0, 90)], selectedPageIds: [],
    });
    const pdf = await PDFDocument.load(await result.arrayBuffer());
    expect(pdf.getPages().map(p => p.getRotation().angle)).toEqual([90, 180]);
  });

  it('interleaves documents and duplicates pages without changing their dimensions', async () => {
    const copyPages = vi.spyOn(PDFDocument.prototype, 'copyPages');
    const a = await source('a', [111, 222]);
    const b = await source('b', [333]);
    const result = await engine.exportWorkspace(new Map([[a.id, a], [b.id, b]]), {
      pages: [page('1', 'a', 1), page('2', 'b'), page('3', 'a'), page('4', 'a', 1)], selectedPageIds: [],
    });
    const pdf = await PDFDocument.load(await result.arrayBuffer());
    expect(pdf.getPages().map(p => p.getWidth())).toEqual([222, 333, 111, 222]);
    expect(copyPages).toHaveBeenCalledTimes(2);
    expect(copyPages.mock.calls.map(([, indices]) => indices)).toEqual([[1, 0, 1], [0]]);
  });

  it('rejects a missing source instead of silently dropping a requested page', async () => {
    await expect(engine.exportWorkspace(new Map(), {
      pages: [page('lost', 'missing')], selectedPageIds: [],
    })).rejects.toMatchObject({ code: 'export-failed' });
  });

  it('rejects an empty workspace instead of creating an unexpected blank page', async () => {
    await expect(engine.exportWorkspace(new Map(), { pages: [], selectedPageIds: [] }))
      .rejects.toMatchObject({ code: 'export-failed' });
  });

  it('rejects an out-of-range source page', async () => {
    const doc = await source('one', [200]);
    await expect(engine.exportWorkspace(new Map([[doc.id, doc]]), {
      pages: [page('bad', doc.id, 5)], selectedPageIds: [],
    })).rejects.toMatchObject({ code: 'export-failed' });
  });

  it('keeps original bytes intact across repeated exports', async () => {
    const doc = await source('original', [210, 220]);
    const original = new Uint8Array(doc.bytes).slice();
    const docs = new Map([[doc.id, doc]]);
    const workspace = { pages: [page('a', doc.id, 1)], selectedPageIds: [] };
    for (let i = 0; i < 2; i++) {
      const output = await engine.exportWorkspace(docs, workspace);
      expect((await PDFDocument.load(await output.arrayBuffer())).getPageCount()).toBe(1);
    }
    expect(new Uint8Array(doc.bytes)).toEqual(original);
  });
});
