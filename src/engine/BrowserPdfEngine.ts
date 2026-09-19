import type { PdfEngine, ImportedDocument, PdfPasswordOptions, ExportOptions, RenderOptions } from './PdfEngine';
import type { WorkspaceState } from '../domain/workspace';
import { AppError } from '../errors/AppError';
import { newId } from '../lib/ids';
import { checkAbort, isAbortError } from './abort';
import { exportInWorker } from './PdfExportClient';
import { PreviewQueue } from './PreviewQueue';

const accepted = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
let renderer: Promise<typeof import('pdfjs-dist')> | undefined;
function loadRenderer() {
  return renderer ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
    .then(([pdf, worker]) => { pdf.GlobalWorkerOptions.workerSrc = worker.default; return pdf; })
    .catch(error => { renderer = undefined; throw error; });
}
function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas encoding failed')), 'image/png'));
}
async function imageSize(bytes: ArrayBuffer, mime: string) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  try { return { width: bitmap.width, height: bitmap.height }; }
  finally { bitmap.close(); }
}

export class BrowserPdfEngine implements PdfEngine {
  private previews = new PreviewQueue();
  // The optional runner isolates transport in Node tests, never a runtime fallback.
  constructor(private exportRunner: typeof exportInWorker = exportInWorker) {}
  dispose(): void { this.previews.clear(); }

  async importFile(file: File, options: PdfPasswordOptions = {}): Promise<ImportedDocument> {
    if (!accepted.has(file.type)) throw new AppError('unsupported-file', 'This file type is not supported yet.');
    const bytes = await file.arrayBuffer();
    if (file.type !== 'application/pdf') {
      const size = await imageSize(bytes, file.type);
      return { id: newId(), fileName: file.name, mimeType: file.type, kind: 'image', bytes, pages: [{ sourcePageIndex: 0, ...size }] };
    }
    const { getDocument } = await loadRenderer();
    // PDF.js can transfer its buffer. Recovery always retains original encrypted bytes.
    const task = getDocument({ data: bytes.slice(0), password: options.password });
    try {
      const pdf = await task.promise;
      const { info } = await pdf.getMetadata();
      let unlockedBytes: ArrayBuffer | undefined;
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
      return { id: newId(), fileName: file.name, mimeType: file.type, kind: 'pdf', bytes, pages, ...(unlockedBytes && { unlockedBytes, encrypted: true }) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === 'PasswordException') throw new AppError('password-protected', 'This PDF needs a valid password. Please try again.');
      throw new AppError('invalid-pdf', 'We couldn’t open this PDF.');
    } finally { await task.destroy(); }
  }

  renderThumbnail(doc: ImportedDocument, index: number, maxEdge: number, options: RenderOptions = {}): Promise<Blob> {
    if (!Number.isInteger(index) || index < 0 || index >= doc.pages.length || !Number.isFinite(maxEdge) || maxEdge < 1 || maxEdge > 2048) return Promise.reject(new Error('Invalid preview request'));
    const rotation = options.rotation ?? 0;
    if (![0, 90, 180, 270].includes(rotation)) return Promise.reject(new Error('Invalid rotation'));
    return this.previews.request(`${doc.id}:${index}:${maxEdge}:${rotation}`, signal => this.renderPage(doc, index, maxEdge, rotation, signal), options);
  }

  private async renderPage(doc: ImportedDocument, index: number, maxEdge: number, rotation: number, signal: AbortSignal): Promise<Blob> {
    checkAbort(signal);
    const canvas = document.createElement('canvas');
    if (doc.kind === 'image') {
      const bitmap = await createImageBitmap(new Blob([doc.bytes], { type: doc.mimeType }));
      try {
        checkAbort(signal);
        const swap = rotation % 180 !== 0;
        const width = swap ? bitmap.height : bitmap.width;
        const height = swap ? bitmap.width : bitmap.height;
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        canvas.width = Math.max(1, Math.ceil(width * scale)); canvas.height = Math.max(1, Math.ceil(height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(bitmap, -bitmap.width * scale / 2, -bitmap.height * scale / 2, bitmap.width * scale, bitmap.height * scale);
        const blob = await canvasBlob(canvas); checkAbort(signal); return blob;
      } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
    }
    const { getDocument } = await loadRenderer();
    checkAbort(signal);
    const task = getDocument({ data: (doc.unlockedBytes ?? doc.bytes).slice(0) });
    let renderTask: { cancel(): void; promise: Promise<unknown> } | undefined;
    let destruction: Promise<void> | undefined;
    const destroy = () => destruction ??= task.destroy();
    const cancel = () => { renderTask?.cancel(); void destroy().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const pdf = await task.promise; checkAbort(signal);
      const page = await pdf.getPage(index + 1); checkAbort(signal);
      const angle = (page.rotate + rotation) % 360;
      const base = page.getViewport({ scale: 1, rotation: angle });
      const viewport = page.getViewport({ scale: maxEdge / Math.max(base.width, base.height), rotation: angle });
      canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
      if (!canvas.getContext('2d')) throw new Error('Canvas unavailable');
      renderTask = page.render({ canvas, viewport });
      await renderTask.promise;
      const blob = await canvasBlob(canvas); checkAbort(signal); return blob;
    } finally {
      signal.removeEventListener('abort', cancel);
      try { await destroy(); } finally { canvas.width = 0; canvas.height = 0; }
    }
  }

  async exportWorkspace(documents: ReadonlyMap<string, ImportedDocument>, workspace: WorkspaceState, options: ExportOptions = {}): Promise<Blob> {
    try {
      checkAbort(options.signal);
      let blob = await this.exportRunner(documents, workspace, options);
      checkAbort(options.signal);
      if (options.password !== undefined) {
        options.onProgress?.({ phase: 'encrypting', completed: workspace.pages.length, total: workspace.pages.length });
        const { lockPdf } = await import('./PdfSecurity');
        checkAbort(options.signal);
        const bytes = await lockPdf(new Uint8Array(await blob.arrayBuffer()), options.password, options.signal);
        blob = new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' });
      }
      checkAbort(options.signal);
      return blob;
    } catch (error) {
      if (isAbortError(error) || error instanceof AppError) throw error;
      throw new AppError('export-failed', 'We couldn’t create the PDF. Your workspace is still here.');
    }
  }
}
