// @ts-expect-error Node typings are intentionally not part of the browser app.
import { readFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName, PDFNumber, degrees } from 'pdf-lib';
import type { PageNumbering, PdfOutputSettings } from '../domain/exportOptions';
import { decoratePdf } from './decoratePdf';

const fontPath = new URL('../assets/NotoSansThaiLooped-Regular.ttf', import.meta.url);

const numbering = (overrides: Partial<PageNumbering> = {}): PageNumbering => ({
  sections: [{ from: 1, to: 1, start: 1, system: 'decimal' }],
  position: 'bottom-center',
  fontSize: 12,
  color: '#000000',
  margin: 24,
  format: 'number',
  ...overrides,
});

beforeEach(async () => {
  const fontBytes = await readFile(fontPath);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(fontBytes)));
});

afterEach(() => vi.unstubAllGlobals());

async function extractedText(pdf: PDFDocument): Promise<string[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = Uint8Array.from(await pdf.save());
  const loadingTask = getDocument({ data: bytes });
  const loaded = await loadingTask.promise;
  try {
    const page = await loaded.getPage(1);
    const content = await page.getTextContent();
    return content.items.flatMap(item => 'str' in item ? [item.str] : []);
  } finally {
    await loadingTask.destroy();
  }
}

async function extractedLayout(pdf: PDFDocument): Promise<{
  width: number;
  height: number;
  items: { str: string; transform: number[]; width: number }[];
  toViewportPoint: (x: number, y: number) => [number, number];
}> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({ data: Uint8Array.from(await pdf.save()) });
  const loaded = await loadingTask.promise;
  try {
    const page = await loaded.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    return {
      width: viewport.width,
      height: viewport.height,
      items: content.items.flatMap(item => 'str' in item
        ? [{ str: item.str, transform: [...item.transform], width: item.width }]
        : []),
      toViewportPoint: (x, y) => {
        const [displayX, displayY] = viewport.convertToViewportPoint(x, y);
        return [displayX, displayY];
      },
    };
  } finally {
    await loadingTask.destroy();
  }
}

describe('PDF decoration', () => {
  it('embeds extractable Thai watermark and rolled-over Latin numbering in content order', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 400]);
    const settings: PdfOutputSettings = {
      watermark: { text: 'ฉบับร่าง', fontSize: 30, color: '#777777', opacity: 0.2, angle: 45 },
      numbering: numbering({
        sections: [{ from: 1, to: 1, start: 27, system: 'latin-lower' }],
        format: 'page-number',
      }),
    };

    await decoratePdf(pdf, settings);

    const text = await extractedText(pdf);
    expect(text.join(' ')).toContain('ฉบับร่าง');
    expect(text.join(' ')).toContain('Page aa');
    expect(text.findIndex(value => value.includes('ฉบับร่าง')))
      .toBeLessThan(text.findIndex(value => value.includes('Page aa')));
  });

  it.each([
    { source: 'สำเนา', extracted: 'สําเนา' },
    { source: 'น้ำ', extracted: 'น้ํา' },
    { source: 'ฉบับร่าง', extracted: 'ฉบับร่าง' },
    { source: 'Café', extracted: 'Café' },
    { source: 'Café', extracted: 'Café' },
  ])('extracts supported watermark text $source without duplicated characters', async ({
    source, extracted,
  }) => {
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 400]);

    await decoratePdf(pdf, {
      watermark: { text: source, fontSize: 30, color: '#777777', opacity: 0.2, angle: 45 },
    });

    const actual = (await extractedText(pdf)).join('');
    expect(actual).toBe(extracted);
    expect(actual.normalize('NFKC')).toBe(source.normalize('NFKC'));
  });

  it.each(['สำเนา', 'น้ำ', 'ก้ำ', 'ฉบับร่าง', 'Café', 'Café'])(
    'preserves glyph selection and positioning when preparing %s for extraction',
    async source => {
      const bytes = await readFile(fontPath);
      const original = fontkit.create(bytes).layout(source);
      const prepared = fontkit.create(bytes).layout(
        source.replaceAll('\u0E33', '\u0E4D\u0E32'),
        { ccmp: false },
      );
      const signature = (layout: typeof original) => layout.glyphs.map((glyph, index) => ({
        id: glyph.id,
        xAdvance: layout.positions[index]!.xAdvance,
        yAdvance: layout.positions[index]!.yAdvance,
        xOffset: layout.positions[index]!.xOffset,
        yOffset: layout.positions[index]!.yOffset,
      }));

      expect(signature(prepared)).toEqual(signature(original));
    },
  );

  it('uses original output indices and the full total for a one-page save preview', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 400]);
    const settings: PdfOutputSettings = {
      numbering: numbering({
        sections: [{ from: 4, to: 4, start: 8, system: 'thai' }],
        format: 'number-total',
      }),
    };

    await decoratePdf(pdf, settings, { pageIndices: [3], totalPages: 5 });

    expect((await extractedText(pdf)).join(' ')).toContain('ซ / 5');
  });

  it.each([
    { rotation: 0, position: 'bottom-right', baselineY: 185.8, viewport: [100, 200] },
    { rotation: 90, position: 'bottom-right', baselineY: 85.8, viewport: [200, 100] },
    { rotation: 180, position: 'bottom-right', baselineY: 185.8, viewport: [100, 200] },
    { rotation: 270, position: 'bottom-right', baselineY: 85.8, viewport: [200, 100] },
    { rotation: 0, position: 'top-right', baselineY: 25, viewport: [100, 200] },
    { rotation: 90, position: 'top-right', baselineY: 25, viewport: [200, 100] },
    { rotation: 180, position: 'top-right', baselineY: 25, viewport: [100, 200] },
    { rotation: 270, position: 'top-right', baselineY: 25, viewport: [200, 100] },
  ] as const)('aligns $position to CropBox intersect MediaBox at $rotation°', async ({
    rotation, position, baselineY, viewport,
  }) => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([200, 300]);
    page.setMediaBox(10, 20, 200, 300);
    page.setCropBox(30, 40, 100, 200);
    page.setRotation(degrees(rotation));
    const drawText = vi.spyOn(page, 'drawText');

    await decoratePdf(pdf, {
      numbering: numbering({ position, margin: 10, format: 'page-number' }),
    });

    expect(drawText).toHaveBeenCalledOnce();
    const [, options] = drawText.mock.calls[0]!;
    expect(options).toBeDefined();
    if (!options) throw new Error('drawText options are missing');
    expect(options.rotate?.angle).toBe(rotation);

    const layout = await extractedLayout(pdf);
    const item = layout.items.find(candidate => candidate.str === 'Page 1');
    expect(item).toBeDefined();
    if (!item) throw new Error('Extracted page number is missing');
    const origin = layout.toViewportPoint(item.transform[4]!, item.transform[5]!);
    const baseline = layout.toViewportPoint(
      item.transform[4]! + item.transform[0]!,
      item.transform[5]! + item.transform[1]!,
    );
    expect([layout.width, layout.height]).toEqual(viewport);
    expect(origin[1]).toBeCloseTo(baselineY, 3);
    expect(origin[0] + item.width).toBeCloseTo(layout.width - 10, 3);
    expect(baseline[1]).toBeCloseTo(origin[1], 3);
  });

  it.each([
    { system: 'latin-lower', start: 1, format: 'page-number', text: 'Page a' },
    { system: 'thai', start: 10, format: 'number', text: 'ญ' },
  ] as const)('keeps bottom $system text descenders visible at zero margin', async ({
    system, start, format, text,
  }) => {
    const pdf = await PDFDocument.create();
    pdf.addPage([100, 200]);

    await decoratePdf(pdf, {
      numbering: numbering({
        sections: [{ from: 1, to: 1, start, system }],
        position: 'bottom-left',
        margin: 0,
        format,
      }),
    });

    const layout = await extractedLayout(pdf);
    const item = layout.items.find(candidate => candidate.str === text);
    expect(item).toBeDefined();
    if (!item) throw new Error('Extracted page number is missing');
    const origin = layout.toViewportPoint(item.transform[4]!, item.transform[5]!);
    expect(origin[1]).toBeCloseTo(195.8, 3);
  });

  it.each([
    numbering({ position: 'bottom-left', margin: 100 }),
    numbering({ position: 'top-center', fontSize: 100, format: 'page-number' }),
    numbering({ position: 'bottom-right', fontSize: Number.MAX_VALUE }),
  ])('rejects numbering whose ink bounds cannot fit the visible page', async invalidNumbering => {
    const pdf = await PDFDocument.create();
    pdf.addPage([100, 100]);

    await expect(decoratePdf(pdf, { numbering: invalidNumbering }))
      .rejects.toThrow('Page number does not fit inside the visible page area.');
  });

  it('allows a large finite watermark to clip while rejecting non-finite layout geometry', async () => {
    const clipped = await PDFDocument.create();
    clipped.addPage([100, 100]);
    await expect(decoratePdf(clipped, {
      watermark: { text: 'DRAFT', fontSize: 100, color: '#777777', opacity: 0.2, angle: 45 },
    })).resolves.toBeUndefined();

    const overflowed = await PDFDocument.create();
    overflowed.addPage([100, 100]);
    await expect(decoratePdf(overflowed, {
      watermark: {
        text: 'DRAFT', fontSize: Number.MAX_VALUE, color: '#777777', opacity: 0.2, angle: 45,
      },
    })).rejects.toThrow('Watermark geometry exceeds the supported page range.');
  });

  it('draws a horizontal watermark horizontally after the page rotation', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([200, 300]);
    page.setRotation(degrees(270));
    const drawText = vi.spyOn(page, 'drawText');

    await decoratePdf(pdf, {
      watermark: { text: 'DRAFT', fontSize: 20, color: '#777777', opacity: 0.2, angle: 0 },
    });

    expect(drawText.mock.calls[0]![1]!.rotate?.angle).toBe(270);
  });

  it('does not fetch or embed the font when no text decoration is enabled', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 300]);

    await decoratePdf(pdf, { compression: 'lossless' });

    expect(fetch).not.toHaveBeenCalled();
    expect(await extractedText(pdf)).toEqual([]);
  });

  it.each([
    [{ pageIndices: [], totalPages: 1 }, 'a page-index count mismatch'],
    [{ pageIndices: [1], totalPages: 1 }, 'an index outside the full output'],
    [{ pageIndices: [0, 0], totalPages: 2 }, 'duplicate original indices'],
  ])('rejects %s', async (context, _reason) => {
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 300]);
    if (context.pageIndices.length === 2) pdf.addPage([200, 300]);
    await expect(decoratePdf(pdf, { numbering: numbering() }, context)).rejects.toThrow();
  });

  it('rejects watermark glyphs that are absent from the bundled font', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 300]);
    await expect(decoratePdf(pdf, {
      watermark: { text: 'DRAFT 🦆', fontSize: 20, color: '#777777', opacity: 0.2, angle: 45 },
    })).rejects.toThrow(/unsupported/i);
  });

  it('rejects a page rotation outside the supported quarter turns', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 300]).node.set(PDFName.of('Rotate'), PDFNumber.of(45));
    await expect(decoratePdf(pdf, { numbering: numbering() })).rejects.toThrow(/rotation/i);
  });
});
