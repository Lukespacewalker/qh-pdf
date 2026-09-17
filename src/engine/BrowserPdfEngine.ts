import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfEngine, ImportedDocument, ExportOptions } from './PdfEngine';
import type { WorkspaceState } from '../domain/workspace';
import { AppError } from '../errors/AppError';
import { newId } from '../lib/ids';
import { PdfWorkerBridge } from './workerBridge';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const accepted = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas encoding failed')), 'image/png');
  });
}

async function imageSize(bytes: ArrayBuffer, mime: string) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  try { return { width: bitmap.width, height: bitmap.height }; }
  finally { bitmap.close(); }
}

async function convertWebpToPng(bytes: ArrayBuffer, mimeType: string): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));
  const canvas = document.createElement('canvas');
  try {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    return await (await canvasBlob(canvas)).arrayBuffer();
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

export class BrowserPdfEngine implements PdfEngine {
  private readonly exportBridge: PdfWorkerBridge | null;

  constructor(exportBridge?: PdfWorkerBridge | null) {
    this.exportBridge = exportBridge === undefined
      ? (typeof Worker === 'undefined' ? null : new PdfWorkerBridge())
      : exportBridge;
  }

  dispose(): void { this.exportBridge?.dispose(); }

  async importFile(file: File): Promise<ImportedDocument> {
    if (!accepted.has(file.type)) {
      throw new AppError('unsupported-file', 'This file type is not supported yet.');
    }
    const bytes = await file.arrayBuffer();
    if (file.type !== 'application/pdf') {
      const size = await imageSize(bytes, file.type);
      return {
        id: newId(), fileName: file.name, mimeType: file.type, kind: 'image', bytes,
        pages: [{ sourcePageIndex: 0, ...size }],
      };
    }
    const task = getDocument({ data: bytes.slice(0) });
    try {
      const pdf = await task.promise;
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        pages.push({ sourcePageIndex: i - 1, width: viewport.width, height: viewport.height });
        page.cleanup();
      }
      return { id: newId(), fileName: file.name, mimeType: file.type, kind: 'pdf', bytes, pages };
    } catch (error) {
      if (error instanceof Error && (error.name === 'PasswordException' || /password/i.test(error.message))) {
        throw new AppError('password-protected', 'This PDF is password-protected. Password-protected files are not supported yet.');
      }
      throw new AppError('invalid-pdf', 'We couldn’t open this PDF.');
    } finally {
      await task.destroy();
    }
  }

  async renderThumbnail(doc: ImportedDocument, pageIndex: number, maxWidth: number): Promise<Blob> {
    if (doc.kind === 'image') return new Blob([doc.bytes], { type: doc.mimeType });
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= doc.pages.length || !Number.isFinite(maxWidth) || maxWidth <= 0) {
      throw new Error('Invalid thumbnail request');
    }
    const task = getDocument({ data: doc.bytes.slice(0) });
    const canvas = document.createElement('canvas');
    try {
      const pdf = await task.promise;
      const page = await pdf.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: maxWidth / base.width });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      if (!canvas.getContext('2d')) throw new Error('Canvas unavailable');
      await page.render({ canvas, viewport }).promise;
      return await canvasBlob(canvas);
    } finally {
      await task.destroy();
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  async exportWorkspace(
    documents: ReadonlyMap<string, ImportedDocument>,
    workspace: WorkspaceState,
    options: ExportOptions = {},
  ): Promise<Blob> {
    if (this.exportBridge) return this.exportBridge.exportWorkspace(documents, workspace, options);

    try {
      const { exportPdfBytes } = await import('./exportPdf');
      const payload = await exportPdfBytes(documents, workspace, {
        convertWebpToPng,
        isCancelled: () => options.signal?.aborted ?? false,
        onProgress: options.onProgress,
      });
      if (options.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
      return new Blob([payload], { type: 'application/pdf' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (error instanceof AppError) throw error;
      throw new AppError('export-failed', 'We couldn’t create the PDF. Your workspace is still here.');
    }
  }
}
