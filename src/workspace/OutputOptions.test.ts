import { describe, expect, it } from 'vitest';
import { initialOutputDraft, outputSettings } from './OutputOptions';

describe('Save option composition', () => {
  it('recomputes a simple numbering section for the chosen output, leaving leading pages unnumbered', () => {
    const draft = { ...initialOutputDraft(), numbers: true, from: '2', start: '7', system: 'thai' as const };
    expect(outputSettings(draft, 8).numbering?.sections).toEqual([{ from: 2, to: 8, start: 7, system: 'thai' }]);
    expect(outputSettings(draft, 3).numbering?.sections).toEqual([{ from: 2, to: 3, start: 7, system: 'thai' }]);
    expect(() => outputSettings(draft, 1)).toThrow();
  });
  it('keeps explicit section boundaries and rejects them when a selected export is too short', () => {
    const draft = { ...initialOutputDraft(), numbers: true, advanced: true, sections: [
      { from: '1', to: '2', start: '1', system: 'roman-lower' as const },
      { from: '3', to: '6', start: '1', system: 'decimal' as const },
    ] };
    expect(outputSettings(draft, 6).numbering?.sections[1]).toEqual({ from: 3, to: 6, start: 1, system: 'decimal' });
    expect(() => outputSettings(draft, 3)).toThrow(/exceeds/);
    expect(draft.sections[1].to).toBe('6');
  });
  it('rejects blank numeric fields instead of turning them into zero, and ignores disabled decorations', () => {
    const draft = { ...initialOutputDraft(), numbers: true, margin: '' };
    expect(() => outputSettings(draft, 3)).toThrow();
    expect(outputSettings({ ...draft, numbers: false, text: '' }, 3)).toEqual({ compression: 'off' });
    expect(outputSettings({ ...initialOutputDraft(), watermark: true, text: 'สำเนา', opacity: '25' }, 3).watermark?.opacity).toBe(0.25);
  });
});
