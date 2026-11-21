import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { CompressionLevel, PdfOutputSettings } from '../domain/exportOptions';
import { createSelectedExportWorkspace, type WorkspaceState } from '../domain/workspace';
import type { ImportedDocument, PdfEngine } from '../engine/PdfEngine';
import { useI18n } from '../i18n/i18n';
import { initialOutputDraft, OutputOptions, outputSettings } from './OutputOptions';
import { OutputPreviewDialog } from './OutputPreviewDialog';
import { Icon } from '../components/Icon';

export type SaveTarget = 'all' | 'selected';

export function SavePanel({ count, selectedCount, locked, exporting, onSave, onCancel, saveButtonRef, engine, workspace, documents, children }: {
  count: number; selectedCount: number; locked: boolean; exporting: boolean;
  onSave: (target: SaveTarget, password?: string, output?: PdfOutputSettings) => Promise<boolean>; onCancel: () => void;
  saveButtonRef: RefObject<HTMLButtonElement | null>;
  engine: PdfEngine; workspace: WorkspaceState; documents: ReadonlyMap<string, ImportedDocument>; children: ReactNode;
}) {
  const { t } = useI18n();
  const [protect, setProtect] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); }, [error]);
  const [draft, setDraft] = useState(initialOutputDraft);
  const compress = draft.compression !== 'off';
  const selectedAction = compress
    ? (selectedCount === 1 ? 'Compress & save {count} selected page' : 'Compress & save {count} selected pages')
    : (selectedCount === 1 ? 'Save {count} selected page' : 'Save {count} selected pages');
  const [previewTarget, setPreviewTarget] = useState<SaveTarget>('all');
  const [preview, setPreview] = useState<{ workspace: WorkspaceState; output: PdfOutputSettings; opener: HTMLButtonElement } | null>(null);
  async function submit(target: SaveTarget) {
    setError('');
    if (protect && (!password || password.includes('\0') || new TextEncoder().encode(password).length > 127)) {
      setError('Enter a password up to 127 UTF-8 bytes (roughly 127 English characters).'); return;
    }
    if (protect && password !== confirm) { setError('The passwords do not match.'); return; }
    try {
      const output = outputSettings(draft, target === 'all' ? count : selectedCount);
      if (await onSave(target, protect ? password : undefined, output)) { setPassword(''); setConfirm(''); }
    } catch (error) { setError(error instanceof Error ? error.message : 'Export failed'); }
  }
  return <section className="save-panel" aria-labelledby="save-title">
    <div className="save-summary"><h2 id="save-title">{t('Save PDF')}</h2>
      <p>{t(count === 1 ? 'Download all {count} page in the order shown.' : 'Download all {count} pages in the order shown.', { count })}</p>
    </div>
    <div className="save-controls">
      <div className="field compression-field">
        <label htmlFor="compression-level">{t('Compression level')}</label>
        <select id="compression-level" aria-describedby="compression-hint" value={draft.compression} disabled={locked}
          onChange={event => setDraft({ ...draft, compression: event.target.value as CompressionLevel })}>
          <option value="off">{t('Off')}</option>
          <option value="lossless">{t('Lossless · keep image quality')}</option>
          <option value="balanced">{t('Balanced · good image quality')}</option>
          <option value="small">{t('Smaller file · lower image quality')}</option>
        </select>
      </div>
      {exporting
        ? <button className="btn danger" onClick={onCancel}>{t('Cancel export')}</button>
        : <div className="save-actions">
          {selectedCount > 0 && <button className="btn" disabled={locked} onClick={() => void submit('selected')}>
            {t(selectedAction, { count: selectedCount })}
          </button>}
          <button ref={saveButtonRef} className="btn primary" disabled={locked} onClick={() => void submit('all')}><Icon name="download" />{t(compress ? 'Compress & save PDF' : 'Save PDF')}</button>
        </div>}
    </div>
    <p className="save-options-note" id="compression-hint">{t(compress
      ? 'Text stays selectable. Already optimized PDFs may stay the same size.'
      : 'Choose a level to compress your PDF when you save.')}</p>
    {error && <p ref={errorRef} className="notice" role="alert">{t(error)}</p>}
    {children}
    <OutputOptions draft={draft} onChange={next => { setDraft(next); setError(''); }} count={previewTarget === 'all' ? count : selectedCount} disabled={locked} />
    <div className="output-preview-actions">
      <label className="field">{t('Preview output')}<select value={previewTarget} disabled={locked} onChange={event => { setPreviewTarget(event.target.value as SaveTarget); setError(''); }}>
        <option value="all">{t('All {count} pages', { count })}</option><option value="selected" disabled={!selectedCount}>{t('{count} selected pages', { count: selectedCount })}</option>
      </select></label>
      <button className="btn" disabled={locked || (previewTarget === 'selected' && !selectedCount)} onClick={event => {
        try {
          const snapshot = previewTarget === 'selected' ? createSelectedExportWorkspace(workspace) : {
            pages: workspace.pages.map(page => ({ ...page, ...(page.crop && { crop: { ...page.crop } }) })), selectedPageIds: [],
          };
          setPreview({ workspace: snapshot, output: outputSettings(draft, snapshot.pages.length), opener: event.currentTarget }); setError('');
        } catch (error) { setError(error instanceof Error ? error.message : 'Invalid output settings'); }
      }}>{t('Preview export')}</button>
    </div>
    <label className="check-label"><input type="checkbox" checked={protect} disabled={locked}
      onChange={event => { setProtect(event.target.checked); setPassword(''); setConfirm(''); setError(''); }} />{t('Require a password to open the saved PDF')}</label>
    {protect ? <div className="password-fields">
      <label className="field">{t('New PDF password')}<input type="password" value={password} autoComplete="new-password" disabled={locked} onChange={event => setPassword(event.target.value)} /></label>
      <label className="field">{t('Confirm password')}<input type="password" value={confirm} autoComplete="new-password" disabled={locked} onChange={event => setConfirm(event.target.value)} /></label>
      <p>{t('Keep this password somewhere safe. We cannot recover it. It is never saved with your workspace.')}</p>
    </div> : <p className="save-note">{t('The downloaded PDF will have no password, even if an original file had one.')}</p>}
    {preview && <OutputPreviewDialog workspace={preview.workspace} output={preview.output} documents={documents} engine={engine}
      opener={preview.opener} onClose={() => setPreview(null)} />}
  </section>;
}
