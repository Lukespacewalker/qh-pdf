import type { WorkspaceState } from '../domain/workspace';
import { AppError } from '../errors/AppError';
import type { ImportedDocument, PdfExportOptions } from './PdfEngine';
import type {
  PdfExportDocument,
  PdfExportRequest,
  PdfExportResponse,
} from './PdfExportProtocol';

const exportFailure = () => new AppError('export-failed', 'We couldn’t create the PDF. Your workspace is still here.');
const exportCancelled = () => new DOMException('Export cancelled', 'AbortError');

function createRequest(
  documents: ReadonlyMap<string, ImportedDocument>,
  workspace: WorkspaceState,
): { request: PdfExportRequest; transfers: ArrayBuffer[] } {
  if (workspace.pages.length === 0) throw exportFailure();
  const referenced = new Map<string, PdfExportDocument>();
  for (const page of workspace.pages) {
    const source = documents.get(page.sourceDocumentId);
    if (!source || !Number.isInteger(page.sourcePageIndex) || page.sourcePageIndex < 0 ||
        page.sourcePageIndex >= source.pages.length || (source.kind === 'image' && page.sourcePageIndex !== 0)) {
      throw exportFailure();
    }
    if (!referenced.has(source.id)) {
      referenced.set(source.id, {
        id: source.id,
        kind: source.kind,
        mimeType: source.mimeType,
        bytes: (source.unlockedBytes ?? source.bytes).slice(0),
        pages: source.pages.map(descriptor => ({ ...descriptor })),
      });
    }
  }
  const exportedDocuments = [...referenced.values()];
  return {
    request: {
      documents: exportedDocuments,
      pages: workspace.pages.map(page => ({
        sourceDocumentId: page.sourceDocumentId,
        sourcePageIndex: page.sourcePageIndex,
        rotation: page.rotation,
      })),
    },
    transfers: exportedDocuments.map(document => document.bytes),
  };
}

export function runPdfExport(
  documents: ReadonlyMap<string, ImportedDocument>,
  workspace: WorkspaceState,
  options: PdfExportOptions = {},
): Promise<ArrayBuffer> {
  if (options.signal?.aborted) return Promise.reject(exportCancelled());

  let job: ReturnType<typeof createRequest>;
  try {
    job = createRequest(documents, workspace);
  } catch {
    return Promise.reject(exportFailure());
  }

  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./PdfExport.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      reject(exportFailure());
      return;
    }

    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', abort);
      worker.terminate();
      complete();
    };
    const fail = () => finish(() => reject(exportFailure()));
    const abort = () => finish(() => reject(exportCancelled()));
    options.signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<PdfExportResponse>) => {
      if (settled) return;
      if (data.type === 'progress') options.onProgress?.(data.progress);
      else if (data.type === 'result') finish(() => resolve(data.bytes));
      else fail();
    };
    worker.onerror = event => { event.preventDefault(); fail(); };
    worker.onmessageerror = fail;
    try {
      worker.postMessage(job.request, job.transfers);
    } catch {
      fail();
    }
  });
}
