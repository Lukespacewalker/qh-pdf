import { degrees, rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import type { PageNumbering, PdfOutputSettings, WatermarkSettings } from '../domain/exportOptions';
import { numberingText, validateOutputSettings } from '../domain/numbering';

const FONT_URL = new URL('../assets/NotoSansThaiLooped-Regular.ttf', import.meta.url);

interface DecorationContext {
  pageIndices?: number[];
  totalPages?: number;
}

interface Point {
  x: number;
  y: number;
}

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

function parseColor(hex: string): ReturnType<typeof rgb> {
  return rgb(
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  );
}

function visibleBox(page: PDFPage): Rectangle {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const x = Math.max(media.x, crop.x);
  const y = Math.max(media.y, crop.y);
  const right = Math.min(media.x + media.width, crop.x + crop.width);
  const top = Math.min(media.y + media.height, crop.y + crop.height);
  if (right <= x || top <= y) throw new Error('The visible page boxes do not intersect');
  return { x, y, width: right - x, height: top - y };
}

function pageRotation(page: PDFPage): 0 | 90 | 180 | 270 {
  const normalized = ((page.getRotation().angle % 360) + 360) % 360;
  if (normalized !== 0 && normalized !== 90 && normalized !== 180 && normalized !== 270) {
    throw new Error('Text decoration supports page rotation in 90-degree turns');
  }
  return normalized;
}

function displaySize(box: Rectangle, rotation: 0 | 90 | 180 | 270): { width: number; height: number } {
  return rotation === 90 || rotation === 270
    ? { width: box.height, height: box.width }
    : { width: box.width, height: box.height };
}

// Converts an upright, post-/Rotate point into the page's unrotated user space.
function fromDisplay(point: Point, box: Rectangle, rotation: 0 | 90 | 180 | 270): Point {
  switch (rotation) {
    case 0: return { x: box.x + point.x, y: box.y + point.y };
    case 90: return { x: box.x + box.width - point.y, y: box.y + point.x };
    case 180: return { x: box.x + box.width - point.x, y: box.y + box.height - point.y };
    case 270: return { x: box.x + point.y, y: box.y + box.height - point.x };
  }
}

function ensureSupportedText(font: PDFFont, text: string): void {
  const supported = new Set(font.getCharacterSet());
  for (const character of Array.from(text)) {
    const codePoint = character.codePointAt(0)!;
    if (!supported.has(codePoint)) {
      throw new Error(`Unsupported text character U+${codePoint.toString(16).toUpperCase()}`);
    }
  }
}

async function embedDecorationFont(output: PDFDocument): Promise<PDFFont> {
  const response = await fetch(FONT_URL);
  if (!response.ok) throw new Error('Could not load the bundled decoration font');
  const [{ default: fontkit }, bytes] = await Promise.all([
    import('@pdf-lib/fontkit'),
    response.arrayBuffer(),
  ]);
  output.registerFontkit(fontkit);
  return output.embedFont(bytes, { subset: true });
}

function drawWatermark(page: PDFPage, font: PDFFont, settings: WatermarkSettings): void {
  ensureSupportedText(font, settings.text);
  const box = visibleBox(page);
  const rotation = pageRotation(page);
  const display = displaySize(box, rotation);
  const width = font.widthOfTextAtSize(settings.text, settings.fontSize);
  const height = font.heightAtSize(settings.fontSize, { descender: false });
  const radians = settings.angle * Math.PI / 180;
  const origin = {
    x: display.width / 2 - (width * Math.cos(radians) - height * Math.sin(radians)) / 2,
    y: display.height / 2 - (width * Math.sin(radians) + height * Math.cos(radians)) / 2,
  };
  const point = fromDisplay(origin, box, rotation);
  page.drawText(settings.text, {
    x: point.x,
    y: point.y,
    size: settings.fontSize,
    font,
    color: parseColor(settings.color),
    opacity: settings.opacity,
    rotate: degrees((rotation + settings.angle) % 360),
  });
}

function drawNumber(
  page: PDFPage,
  font: PDFFont,
  settings: PageNumbering,
  text: string,
): void {
  ensureSupportedText(font, text);
  const box = visibleBox(page);
  const rotation = pageRotation(page);
  const display = displaySize(box, rotation);
  const textWidth = font.widthOfTextAtSize(text, settings.fontSize);
  const textHeight = font.heightAtSize(settings.fontSize, { descender: false });
  const horizontal = settings.position.endsWith('left')
    ? settings.margin
    : settings.position.endsWith('right')
      ? display.width - settings.margin - textWidth
      : (display.width - textWidth) / 2;
  const vertical = settings.position.startsWith('top')
    ? display.height - settings.margin - textHeight
    : settings.margin;
  const point = fromDisplay({ x: horizontal, y: vertical }, box, rotation);
  page.drawText(text, {
    x: point.x,
    y: point.y,
    size: settings.fontSize,
    font,
    color: parseColor(settings.color),
    rotate: degrees(rotation),
  });
}

function resolveContext(output: PDFDocument, context: DecorationContext): {
  pageIndices: number[];
  totalPages: number;
} {
  const pageCount = output.getPageCount();
  const totalPages = context.totalPages ?? pageCount;
  const pageIndices = context.pageIndices ?? Array.from({ length: pageCount }, (_, index) => index);
  if (pageIndices.length !== pageCount) {
    throw new Error('Decoration page indices must match the PDF page count');
  }
  if (!Number.isSafeInteger(totalPages) || totalPages <= 0 || totalPages < pageCount) {
    throw new Error('Decoration total page count is invalid');
  }
  if (context.totalPages !== undefined && context.pageIndices === undefined && totalPages !== pageCount) {
    throw new Error('Original page indices are required for a subset preview');
  }
  const seen = new Set<number>();
  for (const pageIndex of pageIndices) {
    if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= totalPages) {
      throw new Error('A decoration page index is outside the full output');
    }
    if (seen.has(pageIndex)) throw new Error('Decoration page indices must be unique');
    seen.add(pageIndex);
  }
  return { pageIndices, totalPages };
}

export async function decoratePdf(
  output: PDFDocument,
  settings: PdfOutputSettings,
  context: DecorationContext = {},
): Promise<void> {
  const { pageIndices, totalPages } = resolveContext(output, context);
  validateOutputSettings(settings, totalPages);
  if (!settings.watermark && !settings.numbering) return;

  const font = await embedDecorationFont(output);
  const pages = output.getPages();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (settings.watermark) drawWatermark(page, font, settings.watermark);
    if (settings.numbering) {
      const text = numberingText(settings.numbering, pageIndices[pageIndex], totalPages);
      if (text !== null) drawNumber(page, font, settings.numbering, text);
    }
  }
}
