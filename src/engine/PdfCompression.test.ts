import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressPdf } from './PdfCompression';

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

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.failConstruction = false;
  vi.stubGlobal('Worker', FakeWorker);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('PDF compression worker bridge', () => {
  it('transfers a copy, preserves the source, and terminates after success', async () => {
    const source = new Uint8Array([1, 2, 3]);
    const pending = compressPdf(source, 'balanced');
    const worker = FakeWorker.instances[0];
    const [request, transfers] = worker.postMessage.mock.calls[0];

    expect(request).toMatchObject({ level: 'balanced' });
    expect(request.bytes).not.toBe(source.buffer);
    expect(new Uint8Array(request.bytes)).toEqual(source);
    expect(transfers).toEqual([request.bytes]);

    const output = new Uint8Array([4, 5]).buffer;
    worker.onmessage!({ data: { ok: true, bytes: output } } as MessageEvent);

    expect(await pending).toEqual(new Uint8Array([4, 5]));
    expect(source).toEqual(new Uint8Array([1, 2, 3]));
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminates compression when export is cancelled and preserves source bytes', async () => {
    const controller = new AbortController();
    const source = new Uint8Array([1, 2, 3]);
    const pending = compressPdf(source, 'small', controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const worker = FakeWorker.instances[0];

    controller.abort();
    await rejection;

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(source).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('does not miss an abort that races listener registration', async () => {
    let aborted = false;
    const signal = {
      get aborted() { return aborted; },
      addEventListener() { aborted = true; },
      removeEventListener() {},
    } as unknown as AbortSignal;

    await expect(compressPdf(new Uint8Array([1]), 'lossless', signal))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it('terminates timed-out work with a generic export error', async () => {
    const pending = compressPdf(new Uint8Array([1]), 'lossless');
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'export-failed',
      message: 'PDF compression timed out. Your workspace is still here.',
    });
    const worker = FakeWorker.instances[0];

    await vi.advanceTimersByTimeAsync(60_000);
    await rejection;

    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('maps construction, worker, and malformed-response failures to a generic error', async () => {
    FakeWorker.failConstruction = true;
    await expect(compressPdf(new Uint8Array([1]), 'lossless'))
      .rejects.toMatchObject({ code: 'export-failed' });

    FakeWorker.failConstruction = false;
    const crashed = compressPdf(new Uint8Array([1]), 'lossless');
    const crashRejection = expect(crashed).rejects.toMatchObject({
      code: 'export-failed',
      message: 'PDF compression failed. Your workspace is still here.',
    });
    FakeWorker.instances.at(-1)!.onerror!({ preventDefault() {} } as ErrorEvent);
    await crashRejection;

    const malformed = compressPdf(new Uint8Array([1]), 'lossless');
    const malformedRejection = expect(malformed).rejects.toMatchObject({ code: 'export-failed' });
    const worker = FakeWorker.instances.at(-1)!;
    expect(() => worker.onmessage!({ data: null } as MessageEvent)).not.toThrow();
    await malformedRejection;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('surfaces an explicit worker optimization failure without returning the input', async () => {
    const source = new Uint8Array([1, 2, 3]);
    const pending = compressPdf(source, 'balanced');
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'export-failed',
      message: 'PDF compression failed. Your workspace is still here.',
    });
    const worker = FakeWorker.instances[0];

    worker.onmessage!({ data: { ok: false } } as MessageEvent);
    await rejection;

    expect(source).toEqual(new Uint8Array([1, 2, 3]));
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
