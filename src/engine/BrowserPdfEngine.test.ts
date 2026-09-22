import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist';
import type { ImportedDocument } from './PdfEngine';
import type { WorkspacePage } from '../domain/workspace';

// Only isolate the browser renderer at module initialization. Export tests
// below create, write and reopen real PDFs using the real pdf-lib engine.
vi.mock('pdfjs-dist', () => ({ getDocument: vi.fn(), GlobalWorkerOptions: {} }));
vi.mock('./PdfJsLoader', async () => {
  const { getDocument } = await import('pdfjs-dist');
  return { loadPdfJsRuntime: vi.fn(async () => ({ getDocument })) };
});
vi.mock('./PdfExport', async () => {
  const { runPdfExportInProcess } = await import('./test/runPdfExportInProcess');
  return { runPdfExport: runPdfExportInProcess };
});
import { BrowserPdfEngine } from './BrowserPdfEngine';
import { loadPdfJsRuntime } from './PdfJsLoader';

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
beforeEach(() => {
  engine = new BrowserPdfEngine();
  vi.mocked(getDocument).mockReset();
  vi.mocked(loadPdfJsRuntime).mockReset();
  vi.mocked(loadPdfJsRuntime).mockResolvedValue({ getDocument } as never);
});

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

describe('full-page rendering', () => {
  afterEach(() => vi.unstubAllGlobals());

  function renderer(width: number, height: number, sourceRotation = 0, renderPromise: Promise<void> = Promise.resolve()) {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn() })),
      toBlob: vi.fn((callback: (blob: Blob | null) => void) => callback(new Blob(['preview'], { type: 'image/png' }))),
    };
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    const cancel = vi.fn();
    const cleanup = vi.fn();
    const renderSizes: Array<[number, number]> = [];
    const page = {
      cleanup,
      getViewport: vi.fn(({ scale, rotation = sourceRotation }: { scale: number; rotation?: number }) => {
        const swapped = ((rotation % 180) + 180) % 180 === 90;
        return {
          width: (swapped ? height : width) * scale,
          height: (swapped ? width : height) * scale,
          rotation,
        };
      }),
      render: vi.fn(({ canvas: target }: { canvas: { width: number; height: number } }) => {
        renderSizes.push([target.width, target.height]);
        return { promise: renderPromise, cancel };
      }),
    };
    const destroy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getDocument).mockReturnValue({
      promise: Promise.resolve({ getPage: vi.fn().mockResolvedValue(page) }),
      destroy,
    } as never);
    return { canvas, page, cancel, cleanup, destroy, renderSizes };
  }

  it.each([
    { name: 'portrait', width: 600, height: 900, sourceRotation: 0, rotation: 0 as const, maxWidth: 1_200, maxHeight: 800, expected: [533, 800] },
    { name: 'landscape', width: 1_200, height: 600, sourceRotation: 0, rotation: 0 as const, maxWidth: 900, maxHeight: 900, expected: [900, 450] },
    { name: 'long page', width: 100, height: 10_000, sourceRotation: 0, rotation: 0 as const, maxWidth: 5_000, maxHeight: 5_000, expected: [40, 4_096] },
    { name: 'four-million-pixel cap', width: 1_000, height: 1_000, sourceRotation: 0, rotation: 0 as const, maxWidth: 5_000, maxHeight: 5_000, expected: [2_000, 2_000] },
    { name: 'source plus workspace rotation', width: 1_200, height: 600, sourceRotation: 90, rotation: 90 as const, maxWidth: 800, maxHeight: 700, expected: [800, 400] },
  ])('bounds $name rendering while preserving orientation', async ({ width, height, sourceRotation, rotation, maxWidth, maxHeight, expected }) => {
    const { canvas, cleanup, destroy, renderSizes } = renderer(width, height, sourceRotation);
    const bytes = Uint8Array.from([1, 2, 3, 4]).buffer;
    const doc: ImportedDocument = {
      id: 'preview', fileName: 'preview.pdf', mimeType: 'application/pdf', kind: 'pdf', bytes,
      pages: [{ sourcePageIndex: 0, width, height }],
    };

    await engine.renderPage(doc, 0, { maxWidth, maxHeight, rotation });

    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    expect(renderSizes).toEqual([expected]);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    expect(new Uint8Array(bytes)).toEqual(Uint8Array.from([1, 2, 3, 4]));
    expect((vi.mocked(getDocument).mock.calls.at(-1)![0] as { data: ArrayBuffer }).data).not.toBe(bytes);
  });

  it('cancels an in-flight PDF.js render and disposes resources on abort', async () => {
    let rejectRender!: (error: unknown) => void;
    const renderPromise = new Promise<void>((_, reject) => { rejectRender = reject; });
    const resources = renderer(600, 900, 0, renderPromise);
    resources.cancel.mockImplementation(() => rejectRender(new DOMException('cancelled', 'AbortError')));
    const controller = new AbortController();
    const request = engine.renderPage({
      id: 'preview', fileName: 'preview.pdf', mimeType: 'application/pdf', kind: 'pdf',
      bytes: Uint8Array.from([1]).buffer,
      pages: [{ sourcePageIndex: 0, width: 600, height: 900 }],
    }, 0, { maxWidth: 800, maxHeight: 800, rotation: 0, signal: controller.signal });

    await vi.waitFor(() => expect(resources.page.render).toHaveBeenCalledOnce());
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(resources.cancel).toHaveBeenCalledOnce();
    expect(resources.cleanup).toHaveBeenCalledOnce();
    expect(resources.destroy).toHaveBeenCalledOnce();
    expect([resources.canvas.width, resources.canvas.height]).toEqual([0, 0]);
  });

  it('destroys an in-flight PDF.js loading task exactly once on abort', async () => {
    let rejectLoading!: (error: unknown) => void;
    const loading = new Promise<never>((_, reject) => { rejectLoading = reject; });
    const canvas = { width: 0, height: 0 };
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    const destroy = vi.fn().mockImplementation(async () => {
      rejectLoading(new DOMException('cancelled', 'AbortError'));
    });
    vi.mocked(getDocument).mockReturnValue({ promise: loading, destroy } as never);
    const controller = new AbortController();
    const request = engine.renderPage({
      id: 'preview', fileName: 'preview.pdf', mimeType: 'application/pdf', kind: 'pdf',
      bytes: Uint8Array.from([1]).buffer,
      pages: [{ sourcePageIndex: 0, width: 600, height: 900 }],
    }, 0, { maxWidth: 800, maxHeight: 800, rotation: 0, signal: controller.signal });

    await vi.waitFor(() => expect(getDocument).toHaveBeenCalledOnce());
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(destroy).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it('does not create a PDF.js task when preview is cancelled while the runtime loads', async () => {
    let resolveRuntime!: (runtime: { getDocument: typeof getDocument }) => void;
    vi.mocked(loadPdfJsRuntime).mockReturnValueOnce(new Promise(done => { resolveRuntime = done; }) as never);
    const controller = new AbortController();
    const request = engine.renderPage({
      id: 'preview', fileName: 'preview.pdf', mimeType: 'application/pdf', kind: 'pdf',
      bytes: Uint8Array.from([1]).buffer,
      pages: [{ sourcePageIndex: 0, width: 600, height: 900 }],
    }, 0, { maxWidth: 800, maxHeight: 800, rotation: 0, signal: controller.signal });

    controller.abort();
    resolveRuntime({ getDocument });

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(getDocument).not.toHaveBeenCalled();
  });
});
