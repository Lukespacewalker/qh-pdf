import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { lockPdf } from './PdfSecurity';
import { exportInWorker, type ExportWorker } from './PdfExportClient';

class FakeWorker implements ExportWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
}
beforeEach(() => { vi.useFakeTimers(); FakeWorker.instances = []; vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('cancels password processing, clears its timeout and ignores a late result', async () => {
  const controller = new AbortController();
  const source = new Uint8Array([1, 2, 3]);
  const pending = lockPdf(source, 'synthetic-secret', controller.signal);
  const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  const worker = FakeWorker.instances[0];
  const stale = worker.onmessage;
  controller.abort();
  stale?.({ data: { ok: true, bytes: new ArrayBuffer(3) } } as MessageEvent);
  await rejection;
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(worker.onmessage).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  expect(source).toEqual(new Uint8Array([1, 2, 3]));
});
it('does not create a password worker for an already aborted job', async () => {
  await expect(lockPdf(new Uint8Array([1]), 'synthetic-secret', AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
  expect(FakeWorker.instances).toHaveLength(0);
});
it('times out stalled assembly and releases all lifecycle resources', async () => {
  const documents = new Map([['doc', { id: 'doc', fileName: 'synthetic.pdf', mimeType: 'application/pdf', kind: 'pdf' as const, bytes: new ArrayBuffer(2), pages: [{ sourcePageIndex: 0, width: 20, height: 30 }] }]]);
  const workspace = { pages: [{ id: 'page', sourceDocumentId: 'doc', sourcePageIndex: 0, rotation: 0 as const }], selectedPageIds: [] };
  const pending = exportInWorker(documents, workspace);
  const rejection = expect(pending).rejects.toMatchObject({ code: 'export-failed' });
  await vi.advanceTimersByTimeAsync(120_000);
  await rejection;
  expect(FakeWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
  expect(FakeWorker.instances[0].onmessage).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
