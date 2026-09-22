import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PdfOutputSettings } from '../domain/exportOptions';
import { createSelectedExportWorkspace, type WorkspaceState } from '../domain/workspace';
import type { ImportedDocument, PdfEngine } from '../engine/PdfEngine';
import { initialOutputDraft, OutputOptions, outputSettings } from './OutputOptions';
import { OutputPreviewDialog } from './OutputPreviewDialog';

export type SaveTarget = 'all' | 'selected';

export function SavePanel({ count, selectedCount, locked, exporting, onSave, onCancel, saveButtonRef, engine, workspace, documents }: {
  count: number; selectedCount: number; locked: boolean; exporting: boolean;
  onSave: (target: SaveTarget, password?: string, output?: PdfOutputSettings) => Promise<boolean>; onCancel: () => void;
  saveButtonRef: RefObject<HTMLButtonElement | null>;
  engine: PdfEngine; workspace: WorkspaceState; documents: ReadonlyMap<string, ImportedDocument>;
}) {
  const [protect, setProtect] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); }, [error]);
  const [draft, setDraft] = useState(initialOutputDraft);
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
    } catch (error) { setError(error instanceof Error ? error.message : 'Invalid output settings'); }
  }
  return <section className="save-panel" aria-labelledby="save-title">
    <div className="save-summary"><div><h2 id="save-title">Ready to save?</h2>
      <p>Download all {count} {count === 1 ? 'page' : 'pages'} in the order shown.</p></div>
      {exporting
        ? <button className="btn danger" onClick={onCancel}>Cancel export</button>
        : <div className="save-actions">
          {selectedCount > 0 && <button className="btn" disabled={locked} onClick={() => void submit('selected')}>
            Save {selectedCount} selected {selectedCount === 1 ? 'page' : 'pages'}
          </button>}
          <button ref={saveButtonRef} className="btn primary" disabled={locked} onClick={() => void submit('all')}>Save PDF</button>
        </div>}
    </div>
    {error && <p ref={errorRef} className="notice" role="alert">{error}</p>}
    <OutputOptions draft={draft} onChange={next => { setDraft(next); setError(''); }} count={previewTarget === 'all' ? count : selectedCount} disabled={locked} />
    <div className="output-preview-actions">
      <label className="field">Preview output<select value={previewTarget} disabled={locked} onChange={event => { setPreviewTarget(event.target.value as SaveTarget); setError(''); }}>
        <option value="all">All {count} pages</option><option value="selected" disabled={!selectedCount}>{selectedCount} selected pages</option>
      </select></label>
      <button className="btn" disabled={locked || (previewTarget === 'selected' && !selectedCount)} onClick={event => {
        try {
          const snapshot = previewTarget === 'selected' ? createSelectedExportWorkspace(workspace) : {
            pages: workspace.pages.map(page => ({ ...page, ...(page.crop && { crop: { ...page.crop } }) })), selectedPageIds: [],
          };
          setPreview({ workspace: snapshot, output: outputSettings(draft, snapshot.pages.length), opener: event.currentTarget }); setError('');
        } catch (error) { setError(error instanceof Error ? error.message : 'Invalid output settings'); }
      }}>Preview export</button>
    </div>
    <label className="check-label"><input type="checkbox" checked={protect} disabled={locked}
      onChange={event => { setProtect(event.target.checked); setPassword(''); setConfirm(''); setError(''); }} />Require a password to open the saved PDF</label>
    {protect ? <div className="password-fields">
      <label className="field">New PDF password<input type="password" value={password} autoComplete="new-password" disabled={locked} onChange={event => setPassword(event.target.value)} /></label>
      <label className="field">Confirm password<input type="password" value={confirm} autoComplete="new-password" disabled={locked} onChange={event => setConfirm(event.target.value)} /></label>
      <p>Keep this password somewhere safe. We cannot recover it. It is never saved with your workspace.</p>
    </div> : <p className="save-note">The downloaded PDF will have no password, even if an original file had one.</p>}
    {preview && <OutputPreviewDialog workspace={preview.workspace} output={preview.output} documents={documents} engine={engine}
      opener={preview.opener} onClose={() => setPreview(null)} />}
  </section>;
}
