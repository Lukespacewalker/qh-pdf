import type { PDFPage } from 'pdf-lib';
import { assertCrop, type CropMargins } from '../domain/crop';

/** Crop margins are in the page's displayed orientation, including /Rotate. */
export function cropPdfPage(page: PDFPage, crop: CropMargins) {
  assertCrop(crop);
  const box = page.getCropBox();
  const media = page.getMediaBox();
  const x = Math.max(box.x, media.x), y = Math.max(box.y, media.y);
  const width = Math.min(box.x + box.width, media.x + media.width) - x;
  const height = Math.min(box.y + box.height, media.y + media.height) - y;
  if (!(width > 0 && height > 0)) throw new Error('The page has no visible area to crop.');
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  let { top, right, bottom, left } = crop;
  if (rotation === 90) [top, right, bottom, left] = [right, bottom, left, top];
  else if (rotation === 180) [top, right, bottom, left] = [bottom, left, top, right];
  else if (rotation === 270) [top, right, bottom, left] = [left, top, right, bottom];
  else if (rotation !== 0) throw new Error('The source page rotation is unsupported.');
  page.setCropBox(x + width * left, y + height * bottom, width * (1 - left - right), height * (1 - top - bottom));
}
