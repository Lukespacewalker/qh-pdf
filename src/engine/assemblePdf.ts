import { PDFDocument, degrees, type PDFImage, type PDFPage } from 'pdf-lib';
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
  const copiedPdfPages = new Map<number, PDFPage>();
  const pdfGroups = new Map<string, {
    pdf: PDFDocument;
    entries: { outputIndex: number; sourcePageIndex: number; rotation: number }[];
  }>();

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
      // pdf-lib creates a fresh object copier for every copyPages call. Batch
      // each source/rotation combination so shared resource graphs are copied
      // once instead of once per page. Separate rotation groups keep duplicate
      // source pages independently rotatable without re-copying every page.
      const groupKey = `${source.id}:${workspacePage.rotation}`;
      let group = pdfGroups.get(groupKey);
      if (!group) {
        group = { pdf, entries: [] };
        pdfGroups.set(groupKey, group);
      }
      group.entries.push({
        outputIndex: index,
        sourcePageIndex: workspacePage.sourcePageIndex,
        rotation: workspacePage.rotation,
      });
    } else {
      if (workspacePage.sourcePageIndex !== 0 || !source.pages[0]) throw new Error('Invalid image page');
    }
  }

  for (const { pdf, entries } of pdfGroups.values()) {
    const pages = await output.copyPages(pdf, entries.map(entry => entry.sourcePageIndex));
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const entry = entries[index];
      page.setRotation(degrees((page.getRotation().angle + entry.rotation) % 360));
      copiedPdfPages.set(entry.outputIndex, page);
    }
  }

  for (let index = 0; index < request.pages.length; index += 1) {
    const workspacePage = request.pages[index];
    const source = sources.get(workspacePage.sourceDocumentId)!;
    if (source.kind === 'pdf') {
      const page = copiedPdfPages.get(index);
      if (!page) throw new Error('An export source page is invalid');
      output.addPage(page);
    } else {
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
