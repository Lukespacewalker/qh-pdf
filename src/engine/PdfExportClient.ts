import type { WorkspaceState } from '../domain/workspace';
import { AppError } from '../errors/AppError';
import { abortError, checkAbort } from './abort';
import type { ExportOptions, ImportedDocument } from './PdfEngine';
import type { ExportRequest, ExportResponse } from './exportProtocol';

export interface ExportWorker {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: unknown): void;
  terminate(): void;
}
const failure = () => new AppError('export-failed', 'We couldn’t create the PDF. Your workspace is still here.');
export function makeExportRequest(documents: ReadonlyMap<string, ImportedDocument>, workspace: WorkspaceState): ExportRequest {
  if (!workspace.pages.length) throw failure();
  const ids = new Set(workspace.pages.map(page => page.sourceDocumentId));
  const sources = [...ids].map(id => {
    const doc = documents.get(id);
    if (!doc) throw failure();
    return { id, kind: doc.kind, mimeType: doc.mimeType, blob: new Blob([doc.unlockedBytes ?? doc.bytes], { type: doc.mimeType }), pages: doc.pages.map(page => ({ ...page })) };
  });
  return { sources, pages: workspace.pages.map(page => ({ ...page })) };
}
/** One worker per operation; termination interrupts synchronous parsing and save. */
export function exportInWorker(documents: ReadonlyMap<string, ImportedDocument>, workspace: WorkspaceState, options: ExportOptions = {},
  factory: () => ExportWorker = () => new Worker(new URL('./PdfExport.worker.ts', import.meta.url), { type: 'module' }),
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let worker: ExportWorker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const finish = (error?: unknown, bytes?: ArrayBuffer) => {
      if (finished) return;
      finished = true; clearTimeout(timer); options.signal?.removeEventListener('abort', cancelled);
      if (worker) { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate(); }
      if (error) reject(error); else resolve(new Blob([bytes!], { type: 'application/pdf' }));
    };
    const cancelled = () => finish(abortError());
    try {
      checkAbort(options.signal);
      const request = makeExportRequest(documents, workspace);
      checkAbort(options.signal);
      worker = factory();
      options.signal?.addEventListener('abort', cancelled, { once: true });
      timer = setTimeout(() => finish(new AppError('export-failed', 'Creating this PDF took too long. Try fewer pages. Your workspace is still here.')), 120_000);
      worker.onmessage = ({ data }: MessageEvent<ExportResponse>) => {
        if (finished) return;
        if (data?.type === 'progress') {
          if (['assembling', 'writing'].includes(data.phase) && Number.isInteger(data.completed) && data.total === request.pages.length && data.completed >= 0 && data.completed <= data.total) {
            try { options.onProgress?.({ phase: data.phase, completed: data.completed, total: data.total }); } catch { finish(failure()); }
          } else finish(failure());
        } else if (data?.type === 'success' && data.bytes instanceof ArrayBuffer && data.bytes.byteLength) finish(undefined, data.bytes);
        else finish(failure());
      };
      worker.onerror = event => { event.preventDefault(); finish(failure()); };
      worker.onmessageerror = () => finish(failure());
      if (options.signal?.aborted) { cancelled(); return; }
      worker.postMessage(request);
    } catch (error) { finish(error instanceof Error && error.name === 'AbortError' ? error : failure()); }
  });
}
