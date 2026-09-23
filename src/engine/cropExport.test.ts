import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { assemblePdf } from './assemblePdf';

describe('cropped PDF output', () => {
  it.each([
    { rotation: 0, expected: { x: 30, y: 80, width: 140, height: 210 } },
    { rotation: 90, expected: { x: 30, y: 50, width: 140, height: 210 } },
    { rotation: 180, expected: { x: 50, y: 50, width: 140, height: 210 } },
    { rotation: 270, expected: { x: 50, y: 80, width: 140, height: 210 } },
  ])('maps displayed margins onto a nonzero crop box at $rotation degrees', async ({ rotation, expected }) => {
    const source = await PDFDocument.create();
    const page = source.addPage([400, 500]);
    page.setCropBox(10, 20, 200, 300);
    page.setRotation(degrees(rotation));
    const request = {
      documents: [{ id: 'source', kind: 'pdf' as const, mimeType: 'application/pdf',
        bytes: Uint8Array.from(await source.save()).buffer, pages: [{ sourcePageIndex: 0, width: 200, height: 300 }] }],
      pages: [{ sourceDocumentId: 'source', sourcePageIndex: 0, rotation: 0 as const,
        crop: { top: 0.1, right: 0.2, bottom: 0.2, left: 0.1 } }],
    };
    const out = await PDFDocument.load(await assemblePdf(request));
    expect(out.getPage(0).getCropBox()).toEqual(expected);
    expect(out.getPage(0).getMediaBox()).toEqual({ x: 0, y: 0, width: 400, height: 500 });
    expect(out.getPage(0).getRotation().angle).toBe(rotation);
  });

  it('crops two copies independently while preserving the original source', async () => {
    const source = await PDFDocument.create();
    source.addPage([200, 300]);
    const bytes = Uint8Array.from(await source.save()).buffer;
    const out = await PDFDocument.load(await assemblePdf({
      documents: [{ id: 's', kind: 'pdf', mimeType: 'application/pdf', bytes, pages: [{ sourcePageIndex: 0, width: 200, height: 300 }] }],
      pages: [
        { sourceDocumentId: 's', sourcePageIndex: 0, rotation: 0, crop: { top: 0, left: 0.25, bottom: 0, right: 0 } },
        { sourceDocumentId: 's', sourcePageIndex: 0, rotation: 0 },
      ],
    }));
    expect(out.getPage(0).getCropBox()).toEqual({ x: 50, y: 0, width: 150, height: 300 });
    expect(out.getPage(1).getCropBox()).toEqual({ x: 0, y: 0, width: 200, height: 300 });
    expect((await PDFDocument.load(bytes)).getPage(0).getCropBox().width).toBe(200);
  });

  it('rejects invalid margins instead of exporting an uncropped page', async () => {
    const source = await PDFDocument.create(); source.addPage([200, 300]);
    await expect(assemblePdf({
      documents: [{ id: 's', kind: 'pdf', mimeType: 'application/pdf', bytes: Uint8Array.from(await source.save()).buffer,
        pages: [{ sourcePageIndex: 0, width: 200, height: 300 }] }],
      pages: [{ sourceDocumentId: 's', sourcePageIndex: 0, rotation: 0, crop: { top: 0, bottom: 0, left: 0.6, right: 0.4 } }],
    })).rejects.toThrow();
  });
});
