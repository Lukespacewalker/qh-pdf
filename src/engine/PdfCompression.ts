import { AppError } from '../errors/AppError';

export type CompressionLevel = 'lossless' | 'balanced' | 'small';

export interface CompressionRequest {
  bytes: ArrayBuffer;
  level: CompressionLevel;
}

export type CompressionResponse =
  | { ok: true; bytes: ArrayBuffer }
  | { ok: false };

const cancelled = () => new DOMException('Export cancelled', 'AbortError');
const failed = () => new AppError('export-failed', 'PDF compression failed. Your workspace is still here.');
const timedOut = () => new AppError('export-failed', 'PDF compression timed out. Your workspace is still here.');

export function compressPdf(
  bytes: Uint8Array,
  level: CompressionLevel,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  if (signal?.aborted) return Promise.reject(cancelled());

  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./PdfCompression.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      reject(failed());
      return;
    }

    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      complete();
    };
    const fail = () => finish(() => reject(failed()));
    const abort = () => finish(() => reject(cancelled()));
    const timeout = setTimeout(() => finish(() => reject(timedOut())), 60_000);

    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }

    worker.onmessage = ({ data }: MessageEvent<CompressionResponse | null>) => {
      if (data?.ok === true && data.bytes instanceof ArrayBuffer) {
        finish(() => resolve(new Uint8Array(data.bytes)));
      } else {
        fail();
      }
    };
    worker.onerror = event => { event.preventDefault(); fail(); };
    worker.onmessageerror = fail;

    const request: CompressionRequest = { bytes: Uint8Array.from(bytes).buffer, level };
    try {
      worker.postMessage(request, [request.bytes]);
    } catch {
      fail();
    }
  });
}
