import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewQueue } from './PreviewQueue';
import { makeExportRequest, exportInWorker, type ExportWorker } from './PdfExportClient';
import type { ImportedDocument } from './PdfEngine';

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const source: ImportedDocument = { id: 'used', fileName: 'private-name.pdf', kind: 'pdf', mimeType: 'application/pdf', bytes: new Uint8Array([1, 2]).buffer, unlockedBytes: new Uint8Array([3, 4]).buffer, encrypted: true, pages: [{ sourcePageIndex: 0, width: 10, height: 20 }] };
const docs = new Map([['used', source], ['unused', { ...source, id: 'unused' }]]);
const workspace = { pages: [{ id: 'a', sourceDocumentId: 'used', sourcePageIndex: 0, rotation: 0 as const }], selectedPageIds: ['a'] };
class FakeWorker implements ExportWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  request: unknown;
  terminate = vi.fn();
  postMessage(request: unknown) { this.request = request; }
}
afterEach(() => vi.useRealTimers());

describe('export boundary', () => {
  it('snapshots only referenced working bytes and excludes filenames and passwords', async () => {
    const request = makeExportRequest(docs, workspace);
    expect(request.sources).toHaveLength(1);
    expect([...new Uint8Array(await request.sources[0].blob.arrayBuffer())]).toEqual([3, 4]);
    expect(JSON.stringify(request)).not.toContain('private-name');
    expect(JSON.stringify(request)).not.toContain('password');
    expect(new Uint8Array(source.bytes)).toEqual(new Uint8Array([1, 2]));
    expect(new Uint8Array(source.unlockedBytes!)).toEqual(new Uint8Array([3, 4]));
    expect(request.pages[0]).not.toBe(workspace.pages[0]);
  });
  it('does not silently skip invalid sources or empty output', () => {
    expect(() => makeExportRequest(new Map(), workspace)).toThrow();
    expect(() => makeExportRequest(docs, { pages: [], selectedPageIds: [] })).toThrow();
  });
  it('terminates and detaches listeners on success', async () => {
    const worker = new FakeWorker();
    const progress = vi.fn();
    const promise = exportInWorker(docs, workspace, { onProgress: progress }, () => worker);
    worker.onmessage?.({ data: { type: 'progress', phase: 'assembling', completed: 1, total: 1 } } as MessageEvent);
    worker.onmessage?.({ data: { type: 'success', bytes: new Uint8Array([37, 80, 68, 70]).buffer } } as MessageEvent);
    expect((await promise).type).toBe('application/pdf');
    expect(progress).toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.onmessage).toBeNull();
  });
  it('aborts promptly and ignores a late worker response', async () => {
    const worker = new FakeWorker();
    const abort = new AbortController();
    const promise = exportInWorker(docs, workspace, { signal: abort.signal }, () => worker);
    const expectation = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    const stale = worker.onmessage;
    abort.abort();
    stale?.({ data: { type: 'success', bytes: new ArrayBuffer(1) } } as MessageEvent);
    await expectation;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it('rejects already-cancelled, failed startup, posting and message decoding', async () => {
    const factory = vi.fn(() => new FakeWorker());
    await expect(exportInWorker(docs, workspace, { signal: AbortSignal.abort() }, factory)).rejects.toMatchObject({ name: 'AbortError' });
    expect(factory).not.toHaveBeenCalled();
    await expect(exportInWorker(docs, workspace, {}, () => { throw new Error('blocked'); })).rejects.toMatchObject({ code: 'export-failed' });
    const worker = new FakeWorker();
    worker.postMessage = () => { throw new Error('clone failed'); };
    await expect(exportInWorker(docs, workspace, {}, () => worker)).rejects.toMatchObject({ code: 'export-failed' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    const broken = new FakeWorker();
    const pending = exportInWorker(docs, workspace, {}, () => broken);
    const rejection = expect(pending).rejects.toMatchObject({ code: 'export-failed' });
    broken.onmessageerror?.();
    await rejection;
    expect(broken.terminate).toHaveBeenCalledTimes(1);
  });
});

describe('preview scheduling', () => {
  it('bounds concurrency and prioritizes a focused preview over waiting thumbnails', async () => {
    const queue = new PreviewQueue(1);
    const order: string[] = [];
    let finish!: (blob: Blob) => void;
    const a = queue.request('a', () => new Promise<Blob>(resolve => { order.push('a'); finish = resolve; }));
    await flush();
    const b = queue.request('b', async () => { order.push('b'); return new Blob(['b']); });
    const c = queue.request('c', async () => { order.push('c'); return new Blob(['c']); }, { priority: 0 });
    expect(order).toEqual(['a']);
    finish(new Blob(['a']));
    await Promise.all([a, b, c]);
    expect(order).toEqual(['a', 'c', 'b']);
  });
  it('shares duplicate renders but cancelling one subscriber does not cancel the other', async () => {
    const queue = new PreviewQueue();
    const controller = new AbortController();
    let finish!: (blob: Blob) => void;
    const render = vi.fn(() => new Promise<Blob>(resolve => { finish = resolve; }));
    const a = queue.request('same', render, { signal: controller.signal });
    const b = queue.request('same', render);
    const rejection = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    await flush(); controller.abort(); finish(new Blob(['ok']));
    await rejection; expect(await (await b).text()).toBe('ok');
    expect(render).toHaveBeenCalledTimes(1);
    expect(await (await queue.request('same', render)).text()).toBe('ok');
    expect(render).toHaveBeenCalledTimes(1);
  });
  it('aborts abandoned work and evicts blobs beyond the cache budget', async () => {
    const queue = new PreviewQueue(1, 2, 2);
    const controller = new AbortController();
    let observed: AbortSignal | undefined;
    const pending = queue.request('cancel', signal => new Promise((_resolve, reject) => {
      observed = signal; signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
    }), { signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await flush(); controller.abort(); await rejection; expect(observed?.aborted).toBe(true);
    const render = vi.fn(async () => new Blob(['12']));
    await queue.request('a', render); await queue.request('b', render); await queue.request('a', render);
    expect(render).toHaveBeenCalledTimes(3);
  });
});
