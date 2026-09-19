import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lockPdf, unlockPdf } from './PdfSecurity';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.useFakeTimers();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('password worker lifecycle', () => {
  it('transfers a copy and terminates after a result', async () => {
    const source = new Uint8Array([1, 2, 3]).buffer;
    const result = unlockPdf(source, 'test');
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();
    const [request, transfers] = worker.postMessage.mock.calls[0];
    expect(request.bytes).not.toBe(source);
    expect(new Uint8Array(request.bytes)).toEqual(new Uint8Array(source));
    expect(transfers).toEqual([request.bytes]);
    const output = new Uint8Array([4, 5]).buffer;
    worker.onmessage!({ data: { ok: true, bytes: output } } as MessageEvent);
    expect(await result).toBe(output);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminates timed-out work and leaves the source intact', async () => {
    const source = new Uint8Array([1, 2, 3]).buffer;
    const result = unlockPdf(source, 'test');
    const rejection = expect(result).rejects.toMatchObject({ code: 'import-failed' });
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();
    await vi.advanceTimersByTimeAsync(60_000);
    await rejection;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(new Uint8Array(source)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('maps a worker crash to a safe error and permits a fresh retry', async () => {
    const first = unlockPdf(new ArrayBuffer(1), 'test');
    const rejected = expect(first).rejects.toMatchObject({ code: 'import-failed' });
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();
    worker.onerror!({ preventDefault() {} } as ErrorEvent);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    const second = unlockPdf(new ArrayBuffer(1), 'test');
    const retry = FakeWorker.instances[1];
    expect(retry).toBeDefined();
    retry.onmessage!({ data: { ok: false, code: 'password-protected', message: 'Please try again.' } } as MessageEvent);
    await expect(second).rejects.toMatchObject({ code: 'password-protected' });
    expect(retry.terminate).toHaveBeenCalledOnce();
  });

  it('terminates password encryption when export is cancelled', async () => {
    const controller = new AbortController();
    const source = new Uint8Array([1, 2, 3]);
    const pending = lockPdf(source, 'test', controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const worker = FakeWorker.instances[0];

    controller.abort();
    await rejection;

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(new Uint8Array(source)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
