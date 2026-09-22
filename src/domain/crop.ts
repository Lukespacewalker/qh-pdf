export interface CropMargins { top: number; right: number; bottom: number; left: number }
export const noCrop = (): CropMargins => ({ top: 0, right: 0, bottom: 0, left: 0 });

export function isValidCrop(value: unknown): value is CropMargins {
  if (!value || typeof value !== 'object') return false;
  const crop = value as CropMargins;
  return [crop.top, crop.right, crop.bottom, crop.left].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0) &&
    crop.left + crop.right < 1 && crop.top + crop.bottom < 1;
}

export function assertCrop(value: unknown): asserts value is CropMargins {
  if (!isValidCrop(value)) throw new Error('Crop margins must leave a visible area on the page.');
}

export function rotateCrop(crop: CropMargins, delta: 90 | -90): CropMargins {
  assertCrop(crop);
  return delta === 90
    ? { top: crop.left, right: crop.top, bottom: crop.right, left: crop.bottom }
    : { top: crop.right, right: crop.bottom, bottom: crop.left, left: crop.top };
}

export function croppedSize(width: number, height: number, crop?: CropMargins) {
  if (!crop) return { width, height };
  assertCrop(crop);
  return { width: width * (1 - crop.left - crop.right), height: height * (1 - crop.top - crop.bottom) };
}
