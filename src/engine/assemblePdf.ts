import { PDFDocument, degrees, type PDFImage } from 'pdf-lib';
import type { PdfExportDocument, PdfExportRequest } from './PdfExportProtocol';

async function embedImage(out: PDFDocument, source: PdfExportDocument): Promise<PDFImage> {
  if (source.mimeType === 'image/jpeg') return out.embedJpg(source.bytes);
  if (source.mimeType === 'image/png') return out.embedPng(source.bytes);
  if (source.mimeType !== 'image/webp') throw new Error('Unsupported image type');

  const bitmap = await createImageBitmap(new Blob([source.bytes], { type: source.mimeType }));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    return out.embedPng(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  } finally {
    bitmap.close();
  }
}

export async function assemblePdf(
  request: PdfExportRequest,
  onProgress: (completed: number, total: number) => void = () => undefined,
): Promise<ArrayBuffer> {
  if (request.pages.length === 0) throw new Error('Cannot export an empty workspace');
  const output = await PDFDocument.create();
  const sources = new Map(request.documents.map(source => [source.id, source]));
  const pdfCache = new Map<string, PDFDocument>();
  const imageCache = new Map<string, PDFImage>();

  for (let index = 0; index < request.pages.length; index += 1) {
    const workspacePage = request.pages[index];
    const source = sources.get(workspacePage.sourceDocumentId);
    if (!source) throw new Error('An export source is missing');

    if (source.kind === 'pdf') {
      let pdf = pdfCache.get(source.id);
      if (!pdf) {
        pdf = await PDFDocument.load(source.bytes);
        pdfCache.set(source.id, pdf);
      }
      if (!Number.isInteger(workspacePage.sourcePageIndex) || workspacePage.sourcePageIndex < 0 ||
          workspacePage.sourcePageIndex >= pdf.getPageCount()) {
        throw new Error('An export source page is invalid');
      }
      const [page] = await output.copyPages(pdf, [workspacePage.sourcePageIndex]);
      page.setRotation(degrees((page.getRotation().angle + workspacePage.rotation) % 360));
      output.addPage(page);
    } else {
      if (workspacePage.sourcePageIndex !== 0 || !source.pages[0]) throw new Error('Invalid image page');
      const dimensions = source.pages[0];
      let image = imageCache.get(source.id);
      if (!image) {
        image = await embedImage(output, source);
        imageCache.set(source.id, image);
      }
      const page = output.addPage([dimensions.width, dimensions.height]);
      page.drawImage(image, { x: 0, y: 0, width: dimensions.width, height: dimensions.height });
      page.setRotation(degrees(workspacePage.rotation));
    }
    onProgress(index + 1, request.pages.length);
  }

  return Uint8Array.from(await output.save()).buffer;
}
