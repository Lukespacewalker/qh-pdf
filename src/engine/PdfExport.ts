import type { WorkspaceState } from '../domain/workspace';
import { AppError } from '../errors/AppError';
import { assertCrop } from '../domain/crop';
import { validateOutputSettings } from '../domain/numbering';
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
    if (page.crop !== undefined) assertCrop(page.crop);
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
        ...(page.crop && { crop: { ...page.crop } }),
      })),
    },
    transfers: exportedDocuments.map(document => document.bytes),
  };
}

export function runPdfExport(
  documents: ReadonlyMap<string, ImportedDocument>,
  workspace: WorkspaceState,
  options: PdfExportOptions = {},
  decorationContext?: PdfExportRequest['decorationContext'],
): Promise<ArrayBuffer> {
  if (options.signal?.aborted) return Promise.reject(exportCancelled());

  let job: ReturnType<typeof createRequest>;
  try {
    validateOutputSettings(options.output ?? {}, decorationContext?.totalPages ?? workspace.pages.length);
    job = createRequest(documents, workspace);
    if (options.output) job.request.output = structuredClone(options.output);
    if (decorationContext) job.request.decorationContext = structuredClone(decorationContext);
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
    if (options.signal?.aborted) {
      abort();
      return;
    }
    worker.onmessage = ({ data }: MessageEvent<PdfExportResponse | null>) => {
      if (settled) return;
      if (data?.type === 'progress' && data.progress &&
          Number.isFinite(data.progress.completed) && Number.isFinite(data.progress.total)) {
        try { options.onProgress?.(data.progress); }
        catch { fail(); }
      } else if (data?.type === 'result' && data.bytes instanceof ArrayBuffer) {
        finish(() => resolve(data.bytes));
      } else {
        fail();
      }
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
