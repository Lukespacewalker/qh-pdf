import { AppError, type AppErrorCode } from '../errors/AppError';
import { abortError } from './abort';

export interface SecurityRequest { operation: 'lock' | 'unlock'; bytes: ArrayBuffer; password: string }
export type SecurityResponse = { ok: true; bytes: ArrayBuffer } | { ok: false; code: AppErrorCode; message: string };

function runJob(request: SecurityRequest, signal?: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const failureCode = request.operation === 'lock' ? 'export-failed' : 'import-failed';
    let worker: Worker;
    try { worker = new Worker(new URL('./PdfSecurity.worker.ts', import.meta.url), { type: 'module' }); }
    catch { reject(new AppError(failureCode, 'The PDF password tool could not start. Please try again.')); return; }
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      clearTimeout(timeout); signal?.removeEventListener('abort', cancelled);
      worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate();
      return true;
    };
    const cancelled = () => { if (finish()) reject(abortError()); };
    const timeout = setTimeout(() => {
      if (finish()) reject(new AppError(failureCode, 'The PDF password operation timed out. Your workspace is still here.'));
    }, 60_000);
    worker.onmessage = ({ data }: MessageEvent<SecurityResponse>) => {
      if (!finish()) return;
      if (data.ok) resolve(data.bytes); else reject(new AppError(data.code, data.message));
    };
    const failed = () => { if (finish()) reject(new AppError(failureCode, 'The PDF password operation failed. Your workspace is still here.')); };
    worker.onerror = event => { event.preventDefault(); failed(); };
    worker.onmessageerror = failed;
    signal?.addEventListener('abort', cancelled, { once: true });
    if (signal?.aborted) { cancelled(); return; }
    try { worker.postMessage(request, [request.bytes]); } catch { failed(); }
  });
}

export function unlockPdf(bytes: ArrayBuffer, password = ''): Promise<ArrayBuffer> {
  return runJob({ operation: 'unlock', bytes: bytes.slice(0), password });
}
export async function lockPdf(bytes: Uint8Array, password: string, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await runJob({ operation: 'lock', bytes: Uint8Array.from(bytes).buffer, password }, signal));
}
