import { PDFDocument, degrees, type PDFImage } from 'pdf-lib';
import type { ExportRequest, ExportSource } from './exportProtocol';
import type { ExportProgress } from './PdfEngine';

async function embedImage(out: PDFDocument, source: ExportSource): Promise<PDFImage> {
  const bytes = await source.blob.arrayBuffer();
  if (source.mimeType === 'image/jpeg') return out.embedJpg(bytes);
  if (source.mimeType === 'image/png') return out.embedPng(bytes);
  if (source.mimeType !== 'image/webp') throw new Error('Unsupported image');
  const bitmap = await createImageBitmap(source.blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    return await out.embedPng(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
}

/** Pure PDF assembly shared by the real worker and Node fixture tests. No DOM or network. */
export async function assemblePdf(request: ExportRequest, progress?: (value: ExportProgress) => void): Promise<ArrayBuffer> {
  if (!request.pages.length) throw new Error('Empty output');
  const sources = new Map(request.sources.map(source => [source.id, source]));
  const parsed = new Map<string, PDFDocument>();
  const images = new Map<string, PDFImage>();
  const out = await PDFDocument.create();
  const total = request.pages.length;
  progress?.({ phase: 'assembling', completed: 0, total });
  for (const [index, wp] of request.pages.entries()) {
    const source = sources.get(wp.sourceDocumentId);
    if (!source || ![0, 90, 180, 270].includes(wp.rotation)) throw new Error('Invalid output page');
    if (source.kind === 'pdf') {
      let pdf = parsed.get(source.id);
      if (!pdf) { pdf = await PDFDocument.load(await source.blob.arrayBuffer()); parsed.set(source.id, pdf); }
      if (!Number.isInteger(wp.sourcePageIndex) || wp.sourcePageIndex < 0 || wp.sourcePageIndex >= pdf.getPageCount()) throw new Error('Invalid page reference');
      const [page] = await out.copyPages(pdf, [wp.sourcePageIndex]);
      page.setRotation(degrees(((page.getRotation().angle + wp.rotation) % 360 + 360) % 360));
      out.addPage(page);
    } else {
      const info = source.pages[0];
      if (wp.sourcePageIndex !== 0 || !info || !Number.isFinite(info.width) || !Number.isFinite(info.height) || info.width <= 0 || info.height <= 0) throw new Error('Invalid image page');
      let image = images.get(source.id);
      if (!image) { image = await embedImage(out, source); images.set(source.id, image); }
      const page = out.addPage([info.width, info.height]);
      page.drawImage(image, { x: 0, y: 0, width: info.width, height: info.height });
      page.setRotation(degrees(wp.rotation));
    }
    if ((index + 1) % 10 === 0 || index === total - 1) progress?.({ phase: 'assembling', completed: index + 1, total });
  }
  progress?.({ phase: 'writing', completed: total, total });
  return Uint8Array.from(await out.save()).buffer;
}
