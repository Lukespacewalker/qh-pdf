import type { PDFPageProxy, RenderTask } from 'pdfjs-dist';
import type { PdfEngine, ImportedDocument, PageRenderOptions, PdfExportOptions, PdfPasswordOptions } from './PdfEngine';
import type { WorkspaceState } from '../domain/workspace';
import { AppError } from '../errors/AppError';
import { newId } from '../lib/ids';
import { runPdfExport } from './PdfExport';
import { loadPdfJsRuntime } from './PdfJsLoader';
import { assertCrop, croppedSize } from '../domain/crop';
import type { PdfOutputSettings } from '../domain/exportOptions';

const accepted = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_RENDER_PIXELS = 4_000_000;
const MAX_RENDER_DIMENSION = 4_096;

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

function abortError() {
  return new DOMException('The preview render was cancelled.', 'AbortError');
}

function renderSize(width: number, height: number, maxWidth: number, maxHeight: number) {
  if (![width, height, maxWidth, maxHeight].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Invalid page render request');
  }
  const scale = Math.min(
    maxWidth / width,
    maxHeight / height,
    MAX_RENDER_DIMENSION / width,
    MAX_RENDER_DIMENSION / height,
    Math.sqrt(MAX_RENDER_PIXELS / (width * height)),
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
  };
}

function normalizedRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
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
    let pdfJs;
    try {
      pdfJs = await loadPdfJsRuntime();
    } catch {
      throw new AppError('import-failed', 'The PDF tools couldn’t load. Check your connection and try again. If it still fails, save any open work before reloading this tab.');
    }
    // PDF.js may transfer its input buffer. Keep both source and working bytes.
    // This app renders pages only, without the viewer scripting layer.
    const task = pdfJs.getDocument({ data: bytes.slice(0), password: options.password });
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
    const { getDocument } = await loadPdfJsRuntime();
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

  async renderPage(doc: ImportedDocument, pageIndex: number, options: PageRenderOptions): Promise<Blob> {
    if (options.crop !== undefined) assertCrop(options.crop);
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= doc.pages.length ||
        ![0, 90, 180, 270].includes(options.rotation)) {
      throw new Error('Invalid page render request');
    }
    if (options.signal?.aborted) throw abortError();
    if (doc.kind === 'image') {
      const bitmap = await createImageBitmap(new Blob([doc.bytes], { type: doc.mimeType }));
      const canvas = document.createElement('canvas');
      try {
        if (options.signal?.aborted) throw abortError();
        const rotated = options.rotation === 90 || options.rotation === 270;
        const orientedWidth = rotated ? bitmap.height : bitmap.width;
        const orientedHeight = rotated ? bitmap.width : bitmap.height;
        const kept = croppedSize(orientedWidth, orientedHeight, options.crop);
        const size = renderSize(kept.width, kept.height, options.maxWidth, options.maxHeight);
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        const drawWidth = bitmap.width * size.scale;
        const drawHeight = bitmap.height * size.scale;
        context.save();
        if (options.crop) context.translate(-orientedWidth * options.crop.left * size.scale, -orientedHeight * options.crop.top * size.scale);
        if (options.rotation === 90) {
          context.translate(orientedWidth * size.scale, 0);
          context.rotate(Math.PI / 2);
        } else if (options.rotation === 180) {
          context.translate(orientedWidth * size.scale, orientedHeight * size.scale);
          context.rotate(Math.PI);
        } else if (options.rotation === 270) {
          context.translate(0, orientedHeight * size.scale);
          context.rotate(-Math.PI / 2);
        }
        context.drawImage(bitmap, 0, 0, drawWidth, drawHeight);
        context.restore();
        const blob = await canvasBlob(canvas);
        if (options.signal?.aborted) throw abortError();
        return blob;
      } finally {
        bitmap.close();
        canvas.width = 0;
        canvas.height = 0;
      }
    }

    // PDF.js may transfer its input buffer. Render from a copy so export,
    // recovery, retry and undo retain the original source bytes.
    const { getDocument } = await loadPdfJsRuntime();
    if (options.signal?.aborted) throw abortError();
    const task = getDocument({ data: (doc.unlockedBytes ?? doc.bytes).slice(0) });
    const canvas = document.createElement('canvas');
    let page: PDFPageProxy | undefined;
    let renderTask: RenderTask | undefined;
    let destroyPromise: Promise<void> | undefined;
    const destroy = () => destroyPromise ??= task.destroy();
    const cancel = () => {
      if (renderTask) renderTask.cancel();
      else void destroy();
    };
    options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const pdf = await task.promise;
      if (options.signal?.aborted) throw abortError();
      page = await pdf.getPage(pageIndex + 1);
      if (options.signal?.aborted) throw abortError();
      const base = page.getViewport({ scale: 1 });
      const rotation = normalizedRotation(base.rotation + options.rotation);
      const oriented = page.getViewport({ scale: 1, rotation });
      const kept = croppedSize(oriented.width, oriented.height, options.crop);
      const size = renderSize(kept.width, kept.height, options.maxWidth, options.maxHeight);
      const viewport = page.getViewport({ scale: size.scale, rotation });
      canvas.width = size.width;
      canvas.height = size.height;
      if (!canvas.getContext('2d')) throw new Error('Canvas unavailable');
      renderTask = page.render({ canvas, viewport, ...(options.crop && {
        transform: [1, 0, 0, 1, -viewport.width * options.crop.left, -viewport.height * options.crop.top],
      }) });
      await renderTask.promise;
      if (options.signal?.aborted) throw abortError();
      const blob = await canvasBlob(canvas);
      if (options.signal?.aborted) throw abortError();
      return blob;
    } catch (error) {
      if (options.signal?.aborted) throw abortError();
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', cancel);
      page?.cleanup();
      await destroy();
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  async renderExportPage(documents: ReadonlyMap<string, ImportedDocument>, workspace: WorkspaceState, output: PdfOutputSettings,
    pageIndex: number, options: Pick<PageRenderOptions, 'maxWidth' | 'maxHeight' | 'signal'>): Promise<Blob> {
    if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= workspace.pages.length) throw new Error('Invalid output preview page');
    const bytes = await runPdfExport(documents, { pages: [workspace.pages[pageIndex]], selectedPageIds: [] },
      { output, signal: options.signal }, { pageIndices: [pageIndex], totalPages: workspace.pages.length });
    if (options.signal?.aborted) throw abortError();
    const source: ImportedDocument = { id: 'output-preview', fileName: '', mimeType: 'application/pdf', kind: 'pdf', bytes,
      pages: [{ sourcePageIndex: 0, width: 1, height: 1 }] };
    return this.renderPage(source, 0, { ...options, rotation: 0 });
  }

  async exportWorkspace(documents: ReadonlyMap<string, ImportedDocument>, workspace: WorkspaceState, options: PdfExportOptions = {}): Promise<Blob> {
    try {
      let bytes = new Uint8Array(await runPdfExport(documents, workspace, options));
      const level = options.output?.compression;
      if (level && level !== 'off') {
        options.onProgress?.({ phase: 'compressing', completed: workspace.pages.length, total: workspace.pages.length });
        const beforeBytes = bytes.byteLength;
        const { compressPdf } = await import('./PdfCompression');
        bytes = await compressPdf(bytes, level, options.signal);
        options.onCompression?.({ beforeBytes, afterBytes: bytes.byteLength });
      }
      if (options.password !== undefined) {
        options.onProgress?.({ phase: 'protecting', completed: workspace.pages.length, total: workspace.pages.length });
        const { lockPdf } = await import('./PdfSecurity');
        bytes = await lockPdf(bytes, options.password, options.signal);
      }
      if (options.signal?.aborted) throw abortError();
      return new Blob([bytes.buffer], { type: 'application/pdf' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new AppError('export-failed', 'We couldn’t create the PDF. Your workspace is still here.');
    }
  }
}
