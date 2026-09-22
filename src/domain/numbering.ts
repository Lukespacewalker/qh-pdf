import type { NumberingSystem, PageNumbering, PdfOutputSettings } from './exportOptions';

const THAI_ALPHABET = Array.from('กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ');
const LATIN_LOWER = Array.from('abcdefghijklmnopqrstuvwxyz');
const POSITIONS = new Set([
  'top-left', 'top-center', 'top-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]);
const FORMATS = new Set(['number', 'page-number', 'number-total']);
const SYSTEMS = new Set<NumberingSystem>([
  'decimal', 'roman-lower', 'roman-upper', 'latin-lower', 'latin-upper', 'thai',
]);
const COMPRESSION_LEVELS = new Set(['off', 'lossless', 'balanced', 'small']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function requirePositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
}

function requireFinite(value: number, label: string, minimum: number, inclusive: boolean): void {
  if (!Number.isFinite(value) || (inclusive ? value < minimum : value <= minimum)) {
    throw new Error(`${label} is outside its supported range`);
  }
}

function requireColor(value: string, label: string): void {
  if (!HEX_COLOR.test(value)) throw new Error(`${label} must be a six-digit hexadecimal color`);
}

function formatBijective(value: number, alphabet: readonly string[]): string {
  let remaining = value;
  let result = '';
  while (remaining > 0) {
    remaining -= 1;
    result = alphabet[remaining % alphabet.length] + result;
    remaining = Math.floor(remaining / alphabet.length);
  }
  return result;
}

function formatRoman(value: number): string {
  if (value > 3999) throw new Error('Roman page numbers support values from 1 through 3999');
  const numerals = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ] as const;
  let remaining = value;
  let result = '';
  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }
  return result;
}

export function formatPageNumber(value: number, system: NumberingSystem): string {
  requirePositiveSafeInteger(value, 'Page number');
  if (!SYSTEMS.has(system)) throw new Error('Unsupported page-numbering system');
  switch (system) {
    case 'decimal': return String(value);
    case 'roman-lower': return formatRoman(value).toLowerCase();
    case 'roman-upper': return formatRoman(value);
    case 'latin-lower': return formatBijective(value, LATIN_LOWER);
    case 'latin-upper': return formatBijective(value, LATIN_LOWER).toUpperCase();
    case 'thai': return formatBijective(value, THAI_ALPHABET);
  }
}

export function validateOutputSettings(settings: PdfOutputSettings, totalPages: number): void {
  requirePositiveSafeInteger(totalPages, 'Total pages');
  if (settings.compression !== undefined && !COMPRESSION_LEVELS.has(settings.compression)) {
    throw new Error('Unsupported compression level');
  }

  const watermark = settings.watermark;
  if (watermark) {
    if (watermark.text.trim().length === 0 || /[\u0000-\u001f\u007f]/u.test(watermark.text)) {
      throw new Error('Watermark text must contain supported visible characters');
    }
    requireFinite(watermark.fontSize, 'Watermark font size', 0, false);
    requireColor(watermark.color, 'Watermark color');
    requireFinite(watermark.opacity, 'Watermark opacity', 0, true);
    if (watermark.opacity > 1) throw new Error('Watermark opacity cannot exceed 1');
    if (watermark.angle !== 0 && watermark.angle !== 45) throw new Error('Unsupported watermark angle');
  }

  const numbering = settings.numbering;
  if (!numbering) return;
  if (!Array.isArray(numbering.sections) || numbering.sections.length === 0) {
    throw new Error('Page numbering requires at least one section');
  }
  if (!POSITIONS.has(numbering.position)) throw new Error('Unsupported page-number position');
  if (!FORMATS.has(numbering.format)) throw new Error('Unsupported page-number format');
  requireFinite(numbering.fontSize, 'Page-number font size', 0, false);
  requireFinite(numbering.margin, 'Page-number margin', 0, true);
  requireColor(numbering.color, 'Page-number color');

  const sorted = [...numbering.sections].sort((a, b) => a.from - b.from);
  let previousTo = 0;
  for (const section of sorted) {
    requirePositiveSafeInteger(section.from, 'Section first page');
    requirePositiveSafeInteger(section.to, 'Section last page');
    requirePositiveSafeInteger(section.start, 'Section starting value');
    if (!SYSTEMS.has(section.system)) throw new Error('Unsupported page-numbering system');
    if (section.from > section.to) throw new Error('Page-number section ends before it starts');
    if (section.to > totalPages) throw new Error('Page-number section exceeds the exported page count');
    if (section.from <= previousTo) throw new Error('Page-number sections cannot overlap');
    const endValue = section.start + (section.to - section.from);
    if (!Number.isSafeInteger(endValue)) throw new Error('Page-number sequence exceeds the safe integer range');
    if (section.system.startsWith('roman-') && endValue > 3999) {
      throw new Error('Roman page numbers support values from 1 through 3999');
    }
    previousTo = section.to;
  }
}

export function numberingText(
  settings: PageNumbering,
  zeroBasedOutputIndex: number,
  totalPages: number,
): string | null {
  validateOutputSettings({ numbering: settings }, totalPages);
  if (!Number.isSafeInteger(zeroBasedOutputIndex) ||
      zeroBasedOutputIndex < 0 || zeroBasedOutputIndex >= totalPages) {
    throw new Error('Output page index is outside the exported page range');
  }
  const outputPage = zeroBasedOutputIndex + 1;
  const section = settings.sections.find(candidate =>
    outputPage >= candidate.from && outputPage <= candidate.to);
  if (!section) return null;
  const formatted = formatPageNumber(section.start + outputPage - section.from, section.system);
  switch (settings.format) {
    case 'number': return formatted;
    case 'page-number': return `Page ${formatted}`;
    case 'number-total': return `${formatted} / ${totalPages}`;
  }
}
