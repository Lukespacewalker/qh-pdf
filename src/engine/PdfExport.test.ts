import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceState } from '../domain/workspace';
import type { ImportedDocument } from './PdfEngine';
import { runPdfExport } from './PdfExport';

class FakeWorker {
  static instances: FakeWorker[] = [];
  static failConstruction = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    if (FakeWorker.failConstruction) throw new Error('worker unavailable');
    FakeWorker.instances.push(this);
  }
}

function document(id = 'source'): ImportedDocument {
  return {
    id,
    fileName: 'private-name.pdf',
    mimeType: 'application/pdf',
    kind: 'pdf',
    bytes: new Uint8Array([1, 2, 3]).buffer,
    pages: [{ sourcePageIndex: 0, width: 200, height: 400 }],
  };
}

function workspace(sourceDocumentId = 'source', sourcePageIndex = 0): WorkspaceState {
  return {
    pages: [
      { id: 'page-a', sourceDocumentId, sourcePageIndex, rotation: 0 },
      { id: 'page-copy', sourceDocumentId, sourcePageIndex, rotation: 90 },
    ],
    selectedPageIds: [],
  };
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.failConstruction = false;
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => vi.unstubAllGlobals());

describe('PDF export worker bridge', () => {
  it('transfers one copied working buffer per referenced source and preserves original bytes', async () => {
    const doc = document();
    doc.unlockedBytes = new Uint8Array([4, 5, 6]).buffer;
    const original = new Uint8Array(doc.bytes).slice();
    const working = new Uint8Array(doc.unlockedBytes).slice();
    const progress: unknown[] = [];
    const pending = runPdfExport(new Map([[doc.id, doc]]), workspace(), { onProgress: value => progress.push(value) });
    const worker = FakeWorker.instances[0];
    const [request, transfers] = worker.postMessage.mock.calls[0];

    expect(request.documents).toHaveLength(1);
    expect(request.documents[0]).not.toHaveProperty('fileName');
    expect(request.documents[0].bytes).not.toBe(doc.unlockedBytes);
    expect(new Uint8Array(request.documents[0].bytes)).toEqual(working);
    expect(transfers).toEqual([request.documents[0].bytes]);
    expect(request.pages).toHaveLength(2);

    worker.onmessage!({ data: { type: 'progress', progress: { phase: 'assembling', completed: 1, total: 2 } } } as MessageEvent);
    worker.onmessage!({ data: { type: 'progress', progress: { phase: 'assembling', completed: 2, total: 2 } } } as MessageEvent);
    const output = new Uint8Array([7, 8]).buffer;
    worker.onmessage!({ data: { type: 'result', bytes: output } } as MessageEvent);

    expect(await pending).toBe(output);
    expect(progress).toEqual([
      { phase: 'assembling', completed: 1, total: 2 },
      { phase: 'assembling', completed: 2, total: 2 },
    ]);
    expect(new Uint8Array(doc.bytes)).toEqual(original);
    expect(new Uint8Array(doc.unlockedBytes)).toEqual(working);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates on abort, rejects once, and ignores a late result', async () => {
    const controller = new AbortController();
    const doc = document();
    const pending = runPdfExport(new Map([[doc.id, doc]]), workspace(), { signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const worker = FakeWorker.instances[0];

    controller.abort();
    await rejection;
    worker.onmessage!({ data: { type: 'result', bytes: new ArrayBuffer(1) } } as MessageEvent);

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(new Uint8Array(doc.bytes)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('does not miss an abort that races listener registration', async () => {
    let aborted = false;
    const signal = {
      get aborted() { return aborted; },
      addEventListener() { aborted = true; },
      removeEventListener() {},
    } as unknown as AbortSignal;
    const doc = document();

    await expect(runPdfExport(new Map([[doc.id, doc]]), workspace(), { signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it('maps a malformed worker response to a safe error and terminates', async () => {
    const doc = document();
    const pending = runPdfExport(new Map([[doc.id, doc]]), workspace());
    const rejection = expect(pending).rejects.toMatchObject({ code: 'export-failed' });
    const worker = FakeWorker.instances[0];

    expect(() => worker.onmessage!({ data: null } as MessageEvent)).not.toThrow();
    await rejection;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('maps worker construction failure to a safe export error', async () => {
    FakeWorker.failConstruction = true;
    const doc = document();
    await expect(runPdfExport(new Map([[doc.id, doc]]), workspace()))
      .rejects.toMatchObject({ code: 'export-failed', message: 'We couldn’t create the PDF. Your workspace is still here.' });
  });

  it.each(['error', 'messageerror'] as const)('maps worker %s to a safe export error', async eventName => {
    const doc = document();
    const pending = runPdfExport(new Map([[doc.id, doc]]), workspace());
    const rejection = expect(pending).rejects.toMatchObject({ code: 'export-failed' });
    const worker = FakeWorker.instances[0];
    if (eventName === 'error') worker.onerror!({ preventDefault() {} } as ErrorEvent);
    else worker.onmessageerror!();
    await rejection;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects a missing source before starting a worker', async () => {
    await expect(runPdfExport(new Map(), workspace('missing'))).rejects.toMatchObject({ code: 'export-failed' });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('rejects an invalid page before starting a worker', async () => {
    const doc = document();
    await expect(runPdfExport(new Map([[doc.id, doc]]), workspace(doc.id, 3)))
      .rejects.toMatchObject({ code: 'export-failed' });
    expect(FakeWorker.instances).toHaveLength(0);
  });
});
