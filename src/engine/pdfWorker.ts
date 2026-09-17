import type { AppErrorCode } from '../errors/AppError';
import { exportPdfBytes } from './exportPdf';
import type { PdfWorkerRequest, PdfWorkerResponse } from './workerBridge';

interface WorkerScope {
  onmessage: ((event: MessageEvent<PdfWorkerRequest>) => void) | null;
  postMessage(message: PdfWorkerResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
const cancelledJobs = new Set<string>();

async function convertWebpToPng(bytes: ArrayBuffer, mimeType: string): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Offscreen canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    return await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

function post(message: PdfWorkerResponse, transfer?: Transferable[]) {
  scope.postMessage(message, transfer);
}

async function runExport(request: Extract<PdfWorkerRequest, { type: 'export' }>) {
  const { jobId } = request;
  try {
    const documents = new Map(request.documents.map(document => [document.id, document]));
    const payload = await exportPdfBytes(documents, request.workspace, {
      convertWebpToPng,
      isCancelled: () => cancelledJobs.has(jobId),
      onProgress: progress => post({ type: 'progress', jobId, ...progress }),
    });
    if (cancelledJobs.has(jobId)) {
      post({ type: 'cancelled', jobId });
      return;
    }
    post({ type: 'success', jobId, payload }, [payload]);
  } catch (error) {
    if (cancelledJobs.has(jobId) || (error instanceof DOMException && error.name === 'AbortError')) {
      post({ type: 'cancelled', jobId });
      return;
    }
    post({
      type: 'error',
      jobId,
      code: 'export-failed' satisfies AppErrorCode,
      message: 'We couldn’t create the PDF. Your workspace is still here.',
    });
  } finally {
    cancelledJobs.delete(jobId);
  }
}

scope.onmessage = event => {
  const request = event.data;
  if (request.type === 'cancel') {
    cancelledJobs.add(request.jobId);
    return;
  }
  void runExport(request);
};
