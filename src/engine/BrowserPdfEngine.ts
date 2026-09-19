import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfEngine, ImportedDocument, PdfPasswordOptions } from './PdfEngine';
import type { WorkspaceState } from '../domain/workspace';
import { AppError } from '../errors/AppError';
import { newId } from '../lib/ids';
import { runPdfExport } from './PdfExport';

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

export class BrowserPdfEngine implements PdfEngine {
  async importFile(file: File, options: PdfPasswordOptions = {}): Promise<ImportedDocument> {
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
    // PDF.js may transfer its input buffer. Keep both source and working bytes.
    // This app renders pages only, without the viewer scripting layer.
    const task = getDocument({ data: bytes.slice(0), password: options.password });
    try {
      const pdf = await task.promise;
      const { info } = await pdf.getMetadata();
      let unlockedBytes: ArrayBuffer | undefined;
      // PDF.js reports the parsed encryption dictionary, including PDFs with an
      // empty opening password. Plain files never load the QPDF assets.
      if ((info as { EncryptFilterName?: string | null }).EncryptFilterName) {
        const { unlockPdf } = await import('./PdfSecurity');
        unlockedBytes = await unlockPdf(bytes, options.password);
      }
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        pages.push({ sourcePageIndex: i - 1, width: viewport.width, height: viewport.height });
        page.cleanup();
      }
      return {
        id: newId(), fileName: file.name, mimeType: file.type, kind: 'pdf', bytes, pages,
        ...(unlockedBytes && { unlockedBytes, encrypted: true }),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === 'PasswordException') {
        throw new AppError('password-protected', 'This PDF needs a valid password. Please try again.');
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
    const task = getDocument({ data: (doc.unlockedBytes ?? doc.bytes).slice(0) });
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

  async exportWorkspace(documents: ReadonlyMap<string, ImportedDocument>, workspace: WorkspaceState, options: PdfPasswordOptions = {}): Promise<Blob> {
    try {
      let bytes = new Uint8Array(await runPdfExport(documents, workspace));
      if (options.password !== undefined) {
        const { lockPdf } = await import('./PdfSecurity');
        bytes = await lockPdf(bytes, options.password);
      }
      return new Blob([bytes.buffer], { type: 'application/pdf' });
    } catch {
      throw new AppError('export-failed', 'We couldn’t create the PDF. Your workspace is still here.');
    }
  }
}
