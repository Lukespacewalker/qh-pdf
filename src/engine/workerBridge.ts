import type { WorkspaceState } from '../domain/workspace';
import { AppError, type AppErrorCode } from '../errors/AppError';
import { newId } from '../lib/ids';
import type { ImportedDocument, ExportOptions } from './PdfEngine';

export interface PdfWorkerLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}

export type WorkerExportDocument = Omit<ImportedDocument, 'bytes'> & { bytes: ArrayBuffer };

export type PdfWorkerRequest =
  | { type: 'export'; jobId: string; documents: WorkerExportDocument[]; workspace: WorkspaceState }
  | { type: 'cancel'; jobId: string };

export type PdfWorkerResponse =
  | { type: 'progress'; jobId: string; completed: number; total: number }
  | { type: 'success'; jobId: string; payload: ArrayBuffer }
  | { type: 'error'; jobId: string; code: AppErrorCode; message: string }
  | { type: 'cancelled'; jobId: string };

interface PendingJob {
  resolve: (blob: Blob) => void;
  reject: (reason?: unknown) => void;
  onProgress?: ExportOptions['onProgress'];
  signal?: AbortSignal;
  abortListener?: () => void;
}

const abortError = () => new DOMException('Export cancelled', 'AbortError');
const defaultWorkerFactory = (): PdfWorkerLike =>
  new Worker(new URL('./pdfWorker.ts', import.meta.url), { type: 'module' });

export class PdfWorkerBridge {
  private worker: PdfWorkerLike | null = null;
  private readonly pending = new Map<string, PendingJob>();

  constructor(private readonly workerFactory: () => PdfWorkerLike = defaultWorkerFactory) {}

  exportWorkspace(
    documents: ReadonlyMap<string, ImportedDocument>,
    workspace: WorkspaceState,
    options: ExportOptions = {},
  ): Promise<Blob> {
    if (options.signal?.aborted) return Promise.reject(abortError());
    const worker = this.ensureWorker();
    const jobId = newId();
    const sourceIds = new Set(workspace.pages.map(page => page.sourceDocumentId));
    const copies = [...sourceIds]
      .map(id => documents.get(id))
      .filter((document): document is ImportedDocument => Boolean(document))
      .map(document => ({ ...document, bytes: document.bytes.slice(0) }));
    const transfer = copies.map(document => document.bytes as Transferable);

    return new Promise<Blob>((resolve, reject) => {
      const job: PendingJob = { resolve, reject, onProgress: options.onProgress, signal: options.signal };
      if (options.signal) {
        job.abortListener = () => {
          if (!this.pending.delete(jobId)) return;
          this.cleanup(job);
          worker.postMessage({ type: 'cancel', jobId } satisfies PdfWorkerRequest);
          reject(abortError());
          if (this.pending.size === 0 && this.worker === worker) {
            worker.terminate();
            this.worker = null;
          }
        };
        options.signal.addEventListener('abort', job.abortListener, { once: true });
      }
      this.pending.set(jobId, job);
      worker.postMessage({ type: 'export', jobId, documents: copies, workspace } satisfies PdfWorkerRequest, transfer);
    });
  }

  dispose(): void {
    for (const job of this.pending.values()) {
      this.cleanup(job);
      job.reject(abortError());
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  private ensureWorker(): PdfWorkerLike {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    worker.onmessage = event => this.handleMessage(event.data as PdfWorkerResponse);
    worker.onerror = event => {
      const error = new AppError('export-failed', event.message || 'The PDF worker stopped unexpectedly.');
      for (const job of this.pending.values()) {
        this.cleanup(job);
        job.reject(error);
      }
      this.pending.clear();
      worker.terminate();
      if (this.worker === worker) this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private handleMessage(message: PdfWorkerResponse): void {
    const job = this.pending.get(message.jobId);
    if (!job) return;
    if (message.type === 'progress') {
      job.onProgress?.({ completed: message.completed, total: message.total });
      return;
    }
    this.pending.delete(message.jobId);
    this.cleanup(job);
    if (message.type === 'success') {
      job.resolve(new Blob([message.payload], { type: 'application/pdf' }));
    } else if (message.type === 'cancelled') {
      job.reject(abortError());
    } else {
      job.reject(new AppError(message.code, message.message));
    }
  }

  private cleanup(job: PendingJob): void {
    if (job.signal && job.abortListener) job.signal.removeEventListener('abort', job.abortListener);
  }
}
