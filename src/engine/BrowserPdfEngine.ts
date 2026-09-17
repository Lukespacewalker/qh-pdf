import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfEngine, ImportedDocument } from './PdfEngine';
import type { WorkspaceState } from '../domain/workspace';
import { AppError } from '../errors/AppError';
import { newId } from '../lib/ids';

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
    // PDF.js may transfer its input buffer. Always give it a copy so exports
    // and subsequent thumbnail requests retain the original document bytes.
    const task = getDocument({ data: bytes.slice(0), isEvalSupported: false });
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
    const task = getDocument({ data: doc.bytes.slice(0), isEvalSupported: false });
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

  async exportWorkspace(documents: ReadonlyMap<string, ImportedDocument>, workspace: WorkspaceState): Promise<Blob> {
    try {
      if (workspace.pages.length === 0) throw new Error('Cannot export an empty workspace');
      const out = await PDFDocument.create();
      const cache = new Map<string, PDFDocument>();
      for (const wp of workspace.pages) {
        const src = documents.get(wp.sourceDocumentId);
        if (!src) throw new Error('An export source is missing');
        if (src.kind === 'pdf') {
          let pdf = cache.get(src.id);
          if (!pdf) {
            pdf = await PDFDocument.load(src.bytes.slice(0));
            cache.set(src.id, pdf);
          }
          if (!Number.isInteger(wp.sourcePageIndex) || wp.sourcePageIndex < 0 || wp.sourcePageIndex >= pdf.getPageCount()) {
            throw new Error('An export source page is invalid');
          }
          const [page] = await out.copyPages(pdf, [wp.sourcePageIndex]);
          page.setRotation(degrees((page.getRotation().angle + wp.rotation) % 360));
          out.addPage(page);
        } else {
          if (wp.sourcePageIndex !== 0 || !src.pages[0]) throw new Error('Invalid image page');
          const info = src.pages[0];
          const page = out.addPage([info.width, info.height]);
          let embedded;
          if (src.mimeType === 'image/jpeg') embedded = await out.embedJpg(src.bytes);
          else if (src.mimeType === 'image/png') embedded = await out.embedPng(src.bytes);
          else {
            const bitmap = await createImageBitmap(new Blob([src.bytes], { type: src.mimeType }));
            const canvas = document.createElement('canvas');
            try {
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              const ctx = canvas.getContext('2d');
              if (!ctx) throw new Error('Canvas unavailable');
              ctx.drawImage(bitmap, 0, 0);
              embedded = await out.embedPng(await (await canvasBlob(canvas)).arrayBuffer());
            } finally {
              bitmap.close();
              canvas.width = 0;
              canvas.height = 0;
            }
          }
          page.drawImage(embedded, { x: 0, y: 0, width: info.width, height: info.height });
          page.setRotation(degrees(wp.rotation));
        }
      }
      const bytes = await out.save();
      // Allocate a plain ArrayBuffer rather than asserting away the typed-array
      // distinction between ArrayBuffer and SharedArrayBuffer in newer TS.
      return new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' });
    } catch {
      throw new AppError('export-failed', 'We couldn’t create the PDF. Your workspace is still here.');
    }
  }
}
