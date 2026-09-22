import type { CompressionLevel, NumberingSystem, PageNumbering, PdfOutputSettings } from '../domain/exportOptions';
import { formatPageNumber, validateOutputSettings } from '../domain/numbering';
import { useI18n } from '../i18n/i18n';

interface SectionDraft { from: string; to: string; start: string; system: NumberingSystem }
export interface OutputDraft {
  numbers: boolean; advanced: boolean; from: string; start: string; system: NumberingSystem; sections: SectionDraft[];
  position: PageNumbering['position']; format: PageNumbering['format']; size: string; margin: string; color: string;
  watermark: boolean; text: string; watermarkSize: string; watermarkColor: string; opacity: string; angle: 0 | 45;
  compression: CompressionLevel;
}
export const initialOutputDraft = (): OutputDraft => ({
  numbers: false, advanced: false, from: '1', start: '1', system: 'decimal', sections: [],
  position: 'bottom-center', format: 'number', size: '12', margin: '24', color: '#000000',
  watermark: false, text: 'DRAFT', watermarkSize: '48', watermarkColor: '#808080', opacity: '20', angle: 45,
  compression: 'off',
});
const numeric = (value: string) => value.trim() ? Number(value) : NaN;
export function outputSettings(draft: OutputDraft, totalPages: number): PdfOutputSettings {
  const result: PdfOutputSettings = {
    compression: draft.compression,
    ...(draft.numbers && { numbering: {
      sections: draft.advanced ? draft.sections.map(section => ({
        from: numeric(section.from), to: numeric(section.to), start: numeric(section.start), system: section.system,
      })) : [{ from: numeric(draft.from), to: totalPages, start: numeric(draft.start), system: draft.system }],
      position: draft.position, format: draft.format, fontSize: numeric(draft.size), margin: numeric(draft.margin), color: draft.color,
    } }),
    ...(draft.watermark && { watermark: {
      text: draft.text, fontSize: numeric(draft.watermarkSize), color: draft.watermarkColor, opacity: numeric(draft.opacity) / 100, angle: draft.angle,
    } }),
  };
  validateOutputSettings(result, totalPages);
  return result;
}

const systems: [NumberingSystem, string][] = [
  ['decimal', '1, 2, 3'], ['roman-lower', 'i, ii, iii'], ['roman-upper', 'I, II, III'],
  ['latin-lower', 'a, b, c'], ['latin-upper', 'A, B, C'], ['thai', 'ก, ข, ค'],
];
function SystemOptions() { return systems.map(([value, text]) => <option key={value} value={value}>{text}</option>); }

function NumberExample({ id, value, system }: { id: string; value: string; system: NumberingSystem }) {
  const { t } = useI18n();
  try {
    return <span className="field-hint" id={id} aria-live="polite">{t('Example: {value}', { value: formatPageNumber(numeric(value), system) })}</span>;
  } catch {
    return <span className="field-hint" id={id} aria-live="polite">{t('Example unavailable')}</span>;
  }
}

export function OutputOptions({ draft, onChange, count, disabled }: {
  draft: OutputDraft; onChange: (draft: OutputDraft) => void; count: number; disabled: boolean;
}) {
  const { t } = useI18n();
  const set = (change: Partial<OutputDraft>) => onChange({ ...draft, ...change });
  const section = (index: number, change: Partial<SectionDraft>) => set({ sections: draft.sections.map((value, i) => i === index ? { ...value, ...change } : value) });
  return <fieldset className="output-options" disabled={disabled}>
    <legend>{t('Finish your PDF')}</legend>
    <p className="save-options-note">{t('These options apply when you save. Page ranges refer to the order in the chosen export, starting at page 1.')}</p>
    <details><summary>{t('Page numbers')} {draft.numbers ? t('· On') : t('· Off')}</summary>
      <label className="check-label"><input type="checkbox" checked={draft.numbers} onChange={event => set({ numbers: event.target.checked })} />{t('Add page numbers')}</label>
      {draft.numbers && <>
        <label className="check-label advanced-toggle"><input type="checkbox" checked={draft.advanced} onChange={event => set({
          advanced: event.target.checked, sections: draft.sections.length ? draft.sections : [{ from: draft.from, to: String(count), start: draft.start, system: draft.system }],
        })} />{t('Advanced: number sections separately')}</label>
        {draft.advanced ? <div className="numbering-sections">
          <p className="sub">{t('Sections cannot overlap. Pages outside these sections have no number.')}</p>
          {draft.sections.map((value, index) => <fieldset className="numbering-section" key={index}>
            <legend>{t('Section {number}', { number: index + 1 })}</legend><div className="finishing-fields">
              <label className="field">{t('From output page')}<input type="number" min="1" step="1" value={value.from} onChange={event => section(index, { from: event.target.value })} /></label>
              <label className="field">{t('To output page')}<input type="number" min="1" step="1" value={value.to} onChange={event => section(index, { to: event.target.value })} /></label>
              <div className="field"><label htmlFor={`section-start-${index}`}>{t('Starting value')}</label><input id={`section-start-${index}`}
                aria-describedby={`section-number-example-${index}`} type="number" min="1" step="1" value={value.start}
                onChange={event => section(index, { start: event.target.value })} />
                <NumberExample id={`section-number-example-${index}`} value={value.start} system={value.system} /></div>
              <label className="field">{t('Number system')}<select value={value.system} onChange={event => section(index, { system: event.target.value as NumberingSystem })}><SystemOptions /></select></label>
            </div><button className="btn" onClick={() => set({ sections: draft.sections.filter((_, i) => i !== index) })}>{t('Remove section {number}', { number: index + 1 })}</button>
          </fieldset>)}
          <button className="btn" onClick={() => set({ sections: [...draft.sections, { from: String(Number(draft.sections.at(-1)?.to ?? 0) + 1), to: String(count), start: '1', system: 'decimal' }] })}>{t('Add section')}</button>
        </div> : <div className="finishing-fields">
          <label className="field">{t('Start on output page')}<input type="number" min="1" step="1" value={draft.from} onChange={event => set({ from: event.target.value })} /></label>
          <div className="field"><label htmlFor="numbering-start">{t('Starting value')}</label><input id="numbering-start" aria-describedby="number-example"
            type="number" min="1" step="1" value={draft.start} onChange={event => set({ start: event.target.value })} />
            <NumberExample id="number-example" value={draft.start} system={draft.system} /></div>
          <label className="field">{t('Number system')}<select value={draft.system} onChange={event => set({ system: event.target.value as NumberingSystem })}><SystemOptions /></select></label>
        </div>}
        <details className="number-style"><summary>{t('Position and appearance')}</summary><div className="finishing-fields">
          <label className="field">{t('Position')}<select value={draft.position} onChange={event => set({ position: event.target.value as PageNumbering['position'] })}>
            <option value="top-left">{t('Top left')}</option><option value="top-center">{t('Top center')}</option><option value="top-right">{t('Top right')}</option>
            <option value="bottom-left">{t('Bottom left')}</option><option value="bottom-center">{t('Bottom center')}</option><option value="bottom-right">{t('Bottom right')}</option>
          </select></label>
          <label className="field">{t('Number format')}<select value={draft.format} onChange={event => set({ format: event.target.value as PageNumbering['format'] })}>
            <option value="number">{t('Number only')}</option><option value="page-number">{t('Page N')}</option><option value="number-total">{t('N / total pages')}</option>
          </select></label>
          <label className="field">{t('Number size (pt)')}<input type="number" min="1" value={draft.size} onChange={event => set({ size: event.target.value })} /></label>
          <label className="field">{t('Inset from edge (pt)')}<input type="number" min="0" value={draft.margin} onChange={event => set({ margin: event.target.value })} /></label>
          <label className="field">{t('Number color')}<input type="color" value={draft.color} onChange={event => set({ color: event.target.value })} /></label>
        </div></details>
      </>}
    </details>
    <details><summary>{t('Watermark')} {draft.watermark ? t('· On') : t('· Off')}</summary>
      <label className="check-label"><input type="checkbox" checked={draft.watermark} onChange={event => set({ watermark: event.target.checked })} />{t('Add text watermark')}</label>
      {draft.watermark && <div className="finishing-fields">
        <label className="field">{t('Watermark text')}<input value={draft.text} onChange={event => set({ text: event.target.value })} /></label>
        <label className="field">{t('Watermark size (pt)')}<input type="number" min="1" value={draft.watermarkSize} onChange={event => set({ watermarkSize: event.target.value })} /></label>
        <label className="field">{t('Opacity (%)')}<input type="number" min="0" max="100" value={draft.opacity} onChange={event => set({ opacity: event.target.value })} /></label>
        <label className="field">{t('Watermark angle')}<select value={draft.angle} onChange={event => set({ angle: Number(event.target.value) as 0 | 45 })}><option value="45">{t('Diagonal')}</option><option value="0">{t('Horizontal')}</option></select></label>
        <label className="field">{t('Watermark color')}<input type="color" value={draft.watermarkColor} onChange={event => set({ watermarkColor: event.target.value })} /></label>
      </div>}
    </details>
    <details><summary>{t('Compression')}</summary>
      <label className="field">{t('Compression level')}<select value={draft.compression} onChange={event => set({ compression: event.target.value as CompressionLevel })}>
        <option value="off">{t('Off')}</option><option value="lossless">{t('Lossless · keep image quality')}</option><option value="balanced">{t('Balanced · good image quality')}</option><option value="small">{t('Smaller file · lower image quality')}</option>
      </select></label>
      <p className="save-options-note">{t('Balanced and Smaller file may reduce image quality. Text stays selectable. Size savings depend on the document; an already optimized PDF may stay the same size.')}</p>
    </details>
  </fieldset>;
}
