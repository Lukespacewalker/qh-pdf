import { PDFDocument, degrees } from 'pdf-lib';
import type { WorkspaceState } from '../domain/workspace';
import type { ImportedDocument, ExportProgress } from './PdfEngine';

export interface ExportRuntime {
  onProgress?: (progress: ExportProgress) => void;
  isCancelled?: () => boolean;
  convertWebpToPng: (bytes: ArrayBuffer, mimeType: string) => Promise<ArrayBuffer>;
}

const cancelled = () => new DOMException('Export cancelled', 'AbortError');

export async function exportPdfBytes(
  documents: ReadonlyMap<string, ImportedDocument>,
  workspace: WorkspaceState,
  runtime: ExportRuntime,
): Promise<ArrayBuffer> {
  if (workspace.pages.length === 0) throw new Error('Cannot export an empty workspace');
  if (runtime.isCancelled?.()) throw cancelled();

  const out = await PDFDocument.create();
  const cache = new Map<string, PDFDocument>();
  const total = workspace.pages.length;

  for (let index = 0; index < workspace.pages.length; index++) {
    if (runtime.isCancelled?.()) throw cancelled();
    const wp = workspace.pages[index];
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
      else embedded = await out.embedPng(await runtime.convertWebpToPng(src.bytes, src.mimeType));
      page.drawImage(embedded, { x: 0, y: 0, width: info.width, height: info.height });
      page.setRotation(degrees(wp.rotation));
    }

    runtime.onProgress?.({ completed: index + 1, total });
    if (runtime.isCancelled?.()) throw cancelled();
  }

  const bytes = await out.save();
  return Uint8Array.from(bytes).buffer;
}
