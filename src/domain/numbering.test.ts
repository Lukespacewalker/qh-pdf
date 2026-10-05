import { describe, expect, it } from 'vitest';
import type { PageNumbering, PdfOutputSettings } from './exportOptions';
import { formatPageNumber, numberingText, validateOutputSettings } from './numbering';

const numbering = (overrides: Partial<PageNumbering> = {}): PageNumbering => ({
  sections: [{ from: 1, to: 3, start: 1, system: 'decimal' }],
  position: 'bottom-center',
  fontSize: 12,
  color: '#000000',
  margin: 24,
  format: 'number',
  ...overrides,
});

describe('page-number formatting', () => {
  it.each([
    [1, 'roman-lower', 'i'],
    [49, 'roman-upper', 'XLIX'],
    [3999, 'roman-upper', 'MMMCMXCIX'],
    [1, 'latin-lower', 'a'],
    [26, 'latin-lower', 'z'],
    [27, 'latin-lower', 'aa'],
    [52, 'latin-upper', 'AZ'],
    [53, 'latin-upper', 'BA'],
    [1, 'thai', 'ก'],
    [41, 'thai', 'ฮ'],
    [42, 'thai', 'กก'],
  ] as const)('formats %i using %s as %s', (value, system, expected) => {
    expect(formatPageNumber(value, system)).toBe(expected);
  });

  it.each([
    [0, 'decimal'],
    [1.5, 'latin-lower'],
    [Number.MAX_SAFE_INTEGER + 1, 'thai'],
    [4000, 'roman-upper'],
  ] as const)('rejects a value outside the supported %s range', (value, system) => {
    expect(() => formatPageNumber(value, system)).toThrow();
  });
});

describe('output page numbering', () => {
  it('numbers only pages covered by sections and resets each section', () => {
    const settings = numbering({
      sections: [
        { from: 2, to: 3, start: 4, system: 'roman-lower' },
        { from: 5, to: 5, start: 27, system: 'latin-upper' },
      ],
      format: 'page-number',
    });

    expect([0, 1, 2, 3, 4].map(index => numberingText(settings, index, 5)))
      .toEqual([null, 'Page iv', 'Page v', null, 'Page AA']);
  });

  it('uses the final exported page count in number-total format', () => {
    expect(numberingText(numbering({ format: 'number-total' }), 1, 9)).toBe('2 / 9');
  });

  it.each([-1, 3, 1.5])('rejects an invalid zero-based output index %s', index => {
    expect(() => numberingText(numbering(), index, 3)).toThrow();
  });
});

describe('output settings validation', () => {
  it('accepts valid numbering, watermark and compression settings', () => {
    const settings: PdfOutputSettings = {
      numbering: numbering(),
      watermark: { text: 'ฉบับร่าง DRAFT', fontSize: 32, color: '#777777', opacity: 0.2, angle: 45 },
      compression: 'balanced',
    };
    expect(() => validateOutputSettings(settings, 3)).not.toThrow();
  });

  it.each([
    ['a non-positive total', numbering(), 0],
    ['a reversed section', numbering({ sections: [{ from: 2, to: 1, start: 1, system: 'decimal' }] }), 3],
    ['a section past the output', numbering({ sections: [{ from: 1, to: 4, start: 1, system: 'decimal' }] }), 3],
    ['overlapping sections', numbering({ sections: [
      { from: 1, to: 2, start: 1, system: 'decimal' },
      { from: 2, to: 3, start: 1, system: 'decimal' },
    ] }), 3],
    ['an unsafe start', numbering({ sections: [{ from: 1, to: 1, start: Number.MAX_SAFE_INTEGER + 1, system: 'decimal' }] }), 3],
    ['a sequence that overflows', numbering({ sections: [{ from: 1, to: 2, start: Number.MAX_SAFE_INTEGER, system: 'decimal' }] }), 3],
    ['a Roman sequence above 3999', numbering({ sections: [{ from: 1, to: 2, start: 3999, system: 'roman-upper' }] }), 3],
    ['a non-finite font size', numbering({ fontSize: Number.NaN }), 3],
    ['a non-positive font size', numbering({ fontSize: 0 }), 3],
    ['a negative margin', numbering({ margin: -1 }), 3],
    ['an invalid color', numbering({ color: 'black' }), 3],
  ] as const)('rejects %s', (_name, invalidNumbering, totalPages) => {
    expect(() => validateOutputSettings({ numbering: invalidNumbering }, totalPages)).toThrow();
  });

  it.each([
    { text: '   ', fontSize: 20, color: '#777777', opacity: 0.2, angle: 45 },
    { text: 'DRAFT', fontSize: 0, color: '#777777', opacity: 0.2, angle: 45 },
    { text: 'DRAFT', fontSize: 20, color: '#xyzxyz', opacity: 0.2, angle: 45 },
    { text: 'DRAFT', fontSize: 20, color: '#777777', opacity: -0.1, angle: 45 },
    { text: 'DRAFT', fontSize: 20, color: '#777777', opacity: 1.1, angle: 45 },
    { text: 'DRAFT', fontSize: 20, color: '#777777', opacity: 0.2, angle: 90 },
  ])('rejects an invalid watermark %#', watermark => {
    expect(() => validateOutputSettings({ watermark: watermark as never }, 1)).toThrow();
  });

  it('rejects an unknown compression level', () => {
    expect(() => validateOutputSettings({ compression: 'maximum' as never }, 1)).toThrow();
  });
});
