import { AppError, type AppErrorCode } from '../errors/AppError';

export interface SecurityRequest { operation: 'lock' | 'unlock'; bytes: ArrayBuffer; password: string }
export type SecurityResponse = { ok: true; bytes: ArrayBuffer } |
  { ok: false; code: AppErrorCode; message: string };

const cancelled = () => new DOMException('Export cancelled', 'AbortError');

function runJob(request: SecurityRequest, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (signal?.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const failureCode = request.operation === 'lock' ? 'export-failed' : 'import-failed';
    let worker: Worker;
    try {
      worker = new Worker(new URL('./PdfSecurity.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      reject(new AppError(failureCode, 'The PDF password tool could not start. Please try again.'));
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
    const abort = () => finish(() => reject(cancelled()));
    const timeout = setTimeout(() => {
      finish(() => reject(new AppError(failureCode, 'The PDF password operation timed out. Your workspace is still here.')));
    }, 60_000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<SecurityResponse>) => {
      finish(() => {
        if (data.ok) resolve(data.bytes);
        else reject(new AppError(data.code, data.message));
      });
    };
    const failed = () => {
      finish(() => reject(new AppError(failureCode, 'The PDF password operation failed. Your workspace is still here.')));
    };
    worker.onerror = event => { event.preventDefault(); failed(); };
    worker.onmessageerror = failed;
    try { worker.postMessage(request, [request.bytes]); }
    catch { failed(); }
  });
}

// A fresh worker per operation contains parser failures and releases its WASM
// memory after completion. Copies protect source buffers from transfer detachment.
export function unlockPdf(bytes: ArrayBuffer, password = ''): Promise<ArrayBuffer> {
  return runJob({ operation: 'unlock', bytes: bytes.slice(0), password });
}

export async function lockPdf(bytes: Uint8Array, password: string, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await runJob({ operation: 'lock', bytes: Uint8Array.from(bytes).buffer, password }, signal));
}
