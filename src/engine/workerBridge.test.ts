import { describe, expect, it, vi } from 'vitest';
import type { ImportedDocument } from './PdfEngine';
import type { WorkspaceState } from '../domain/workspace';
import { PdfWorkerBridge, type PdfWorkerLike } from './workerBridge';

class FakeWorker implements PdfWorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: unknown[] = [];
  terminated = false;

  postMessage(message: unknown): void { this.posted.push(message); }
  terminate(): void { this.terminated = true; }
  emit(data: unknown): void { this.onmessage?.({ data } as MessageEvent); }
}

const docs = new Map<string, ImportedDocument>([
  ['doc', {
    id: 'doc', fileName: 'source.pdf', mimeType: 'application/pdf', kind: 'pdf',
    bytes: new Uint8Array([1, 2, 3]).buffer,
    pages: [{ sourcePageIndex: 0, width: 100, height: 200 }],
  }],
]);
const workspace: WorkspaceState = {
  pages: [{ id: 'page', sourceDocumentId: 'doc', sourcePageIndex: 0, rotation: 0 }],
  selectedPageIds: [],
};

function requestJobId(worker: FakeWorker) {
  const message = worker.posted[0] as { type: string; jobId: string };
  expect(message.type).toBe('export');
  return message.jobId;
}

describe('PdfWorkerBridge', () => {
  it('delivers progress and resolves an exported PDF', async () => {
    const worker = new FakeWorker();
    const progress = vi.fn();
    const bridge = new PdfWorkerBridge(() => worker);

    const pending = bridge.exportWorkspace(docs, workspace, { onProgress: progress });
    const jobId = requestJobId(worker);
    worker.emit({ type: 'progress', jobId, completed: 1, total: 1 });
    worker.emit({ type: 'success', jobId, payload: new Uint8Array([37, 80, 68, 70]).buffer });

    const result = await pending;
    expect(progress).toHaveBeenCalledWith({ completed: 1, total: 1 });
    expect(result.type).toBe('application/pdf');
    expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([37, 80, 68, 70]);
    bridge.dispose();
    expect(worker.terminated).toBe(true);
  });

  it('rejects immediately when cancelled and ignores a stale success', async () => {
    const worker = new FakeWorker();
    const bridge = new PdfWorkerBridge(() => worker);
    const controller = new AbortController();

    const first = bridge.exportWorkspace(docs, workspace, { signal: controller.signal });
    const firstJobId = requestJobId(worker);
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.posted).toContainEqual({ type: 'cancel', jobId: firstJobId });

    worker.emit({ type: 'success', jobId: firstJobId, payload: new Uint8Array([1]).buffer });

    const second = bridge.exportWorkspace(docs, workspace);
    const secondRequest = worker.posted.findLast(message => (message as { type?: string }).type === 'export') as { jobId: string };
    worker.emit({ type: 'success', jobId: secondRequest.jobId, payload: new Uint8Array([2]).buffer });
    expect([...new Uint8Array(await (await second).arrayBuffer())]).toEqual([2]);
  });

  it('does not start work for an already aborted signal', async () => {
    const worker = new FakeWorker();
    const bridge = new PdfWorkerBridge(() => worker);
    const controller = new AbortController();
    controller.abort();

    await expect(bridge.exportWorkspace(docs, workspace, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.posted).toEqual([]);
  });
});
