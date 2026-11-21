import { useEffect, useMemo, useRef, useState } from 'react';
import { MascotState } from '../brand/MascotState';
import { createSelectedExportWorkspace, type WorkspaceState } from '../domain/workspace';
import type { ExportProgress, PdfEngine } from '../engine/PdfEngine';
import { RecoveryPanel } from '../recovery/RecoveryPanel';
import { RelatedTools } from '../brand/RelatedTools';
import { usePasswordImport } from './usePasswordImport';
import { useWorkspaceStore } from './useWorkspaceStore';
import type { SaveTarget } from './SavePanel';
import { WelcomePanel } from './WelcomePanel';
import { Icon } from '../components/Icon';
import { workspaceShortcut } from './workspaceShortcut';
import type { PdfOutputSettings } from '../domain/exportOptions';
import { useI18n } from '../i18n/i18n';

function download(blob: Blob, filename: string) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function WorkspaceScreen({ engine }: { engine: PdfEngine }) {
  const { language, t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const [drag, setDrag] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [recoveryPending, setRecoveryPending] = useState(true);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [editor, setEditor] = useState<typeof import('./ActiveWorkspace') | 'unavailable'>();
  const editorLoad = useRef<Promise<typeof import('./ActiveWorkspace')> | null>(null);

  const [done, setDone] = useState(false);
  const [savedBytes, setSavedBytes] = useState(0);
  const [compressionInfo, setCompressionInfo] = useState<{ beforeBytes: number; afterBytes: number } | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportTotal, setExportTotal] = useState(0);
  const [exportNotice, setExportNotice] = useState('');
  const exportJob = useRef<AbortController | null>(null);
  const store = useWorkspaceStore();
  const ws = store.history.present;
  const locked = store.busy || exporting || restoring;
  const Editor = editor === 'unavailable' ? undefined : editor?.ActiveWorkspace;
  const needsEditor = store.busy || restoring || ws.pages.length > 0;
  const editLocked = locked || recoveryPending || Boolean(activePage) || (ws.pages.length > 0 && !Editor);
  const selected = ws.selectedPageIds.length;
  const { importDocument, passwordDialog } = usePasswordImport(engine);
  useEffect(() => {
    if (editor || !needsEditor) return;
    let current = true;
    editorLoad.current ??= import('./ActiveWorkspace');
    void editorLoad.current.then(
      module => { if (current) setEditor(module); },
      () => { if (current) setEditor('unavailable'); },
    );
    return () => { current = false; };
  }, [editor, needsEditor]);
  useEffect(() => { setDone(false); }, [ws.pages]);
  useEffect(() => () => exportJob.current?.abort(), []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.keyCode === 229) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const action = workspaceShortcut(event, {
        locked: editLocked, modal: Boolean(document.querySelector('dialog[open]')),
        editable: Boolean(target?.isContentEditable || target?.closest('input, textarea, select, [role="textbox"]')),
        pages: ws.pages.length, selected, canUndo: store.history.past.length > 0, canRedo: store.history.future.length > 0,
      });
      if (!action) return;
      if (action === 'save') {
        if (!saveButton.current || saveButton.current.disabled) return;
        event.preventDefault(); saveButton.current.click();
      } else { event.preventDefault(); store[action](); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [editLocked, selected, store, ws.pages.length]);

  async function add(files: File[]) {
    if (editLocked || files.length === 0) return;
    setDone(false);
    setCompressionInfo(null);
    setExportNotice('');
    await store.addFiles(files, importDocument);
  }
  async function save(target: SaveTarget, password?: string, output?: PdfOutputSettings) {
    if (editLocked) return false;
    store.clearError();
    const current = useWorkspaceStore.getState();
    const snapshot: WorkspaceState = target === 'selected'
      ? createSelectedExportWorkspace(current.history.present)
      : {
        pages: current.history.present.pages.map(page => ({ ...page, ...(page.crop && { crop: { ...page.crop } }) })),
        selectedPageIds: [...current.history.present.selectedPageIds],
      };
    if (snapshot.pages.length === 0) return false;
    const documents = new Map(current.documents);
    const controller = new AbortController();
    exportJob.current = controller;
    setExporting(true);
    setDone(false);
    setCompressionInfo(null);
    setExportNotice('');
    setExportTotal(snapshot.pages.length);
    setExportProgress({ phase: 'assembling', completed: 0, total: snapshot.pages.length });
    try {
      const blob = await engine.exportWorkspace(documents, snapshot, {
        ...(password === undefined ? {} : { password }),
        signal: controller.signal,
        onProgress: setExportProgress,
        onCompression: setCompressionInfo,
        output,
      });
      download(blob, target === 'selected' ? 'quack-honk-selected-pages.pdf' : 'quack-honk-document.pdf');
      setSavedBytes(blob.size);
      setDone(true);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setExportNotice('Export cancelled. Your workspace is still here.');
        return false;
      }
      throw error;
    } finally {
      if (exportJob.current === controller) exportJob.current = null;
      setExportProgress(null);
      setExporting(false);
    }
  }
  function cancelExport() { exportJob.current?.abort(); }
  const fileInput = <input ref={input} hidden type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp"
    disabled={editLocked} onChange={event => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = '';
      void add(files);
    }} />;
  const historyActions = <div className="history-tools">
    <button className="btn" onClick={store.undo} disabled={editLocked || !store.history.past.length}><Icon name="undo" />{t('Undo')}</button>
    <button className="btn" onClick={store.redo} disabled={editLocked || !store.history.future.length}><Icon name="redo" />{t('Redo')}</button>
  </div>;
  const error = store.error && <div className="notice" role="alert">{t(store.error)}</div>;

  return <main className={`shell workspace-layout ${!ws.pages.length ? 'empty-wrap' : ''}`}>
    <div className="workspace-content">
      {!ws.pages.length ? <>
        <WelcomePanel busy={store.busy} locked={editLocked} drag={drag} onChoose={() => input.current?.click()}
          onDragChange={setDrag} onDrop={files => void add(files)} error={error}
          history={(store.history.past.length > 0 || store.history.future.length > 0) ? historyActions : null} />
      </> : <>
        <div className="head">
          <div><p className="eyebrow">{t('Document workspace')}</p><h1>{t('Your document')}</h1><p className="sub">{t('{count} pages', { count: ws.pages.length })}</p></div>
          <div className="document-actions">
            <button className="btn add-files" onClick={() => input.current?.click()} disabled={editLocked}><Icon name="add" />{t('Add files')}</button>
            {Editor && <a href="#compression-level">{t('Compression settings')}</a>}
          </div>
        </div>
        {error}
        {Editor ? <Editor engine={engine} historyActions={historyActions} locked={locked} editLocked={editLocked}
          recoveryPending={recoveryPending} activePage={activePage} setActivePage={setActivePage} exporting={exporting}
          saveButton={saveButton} save={save} cancelExport={cancelExport}>
          {exporting && <div className="status" role="status"><MascotState state="working" alt={t('Quack working')} /><div className="export-status">
            <strong>{exportProgress?.phase === 'protecting' ? t('Protecting your PDF…') : exportProgress?.phase === 'compressing' ? t('Compressing your PDF…') :
              t('Creating page {current} of {total}…', { current: exportProgress?.completed ?? 0, total: exportProgress?.total ?? exportTotal })}</strong>
            <progress aria-label={t('Creating PDF')} max={exportProgress?.total ?? exportTotal}
              value={exportProgress?.phase === 'assembling' ? exportProgress.completed : undefined} />
            <div className="sub">{t('Everything is being processed in this browser.')}</div>
          </div></div>}
          {exportNotice && <div className="save-complete" role="status">{t(exportNotice)}</div>}
          {done && <div className="save-complete" role="status"><strong>{t('Your PDF is ready.')}</strong>{' '}
            {t('Final file: {size} KB. Created without uploading your document.', {
              size: new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(savedBytes / 1024),
            })}
            {compressionInfo && <><br />{compressionInfo.afterBytes < compressionInfo.beforeBytes
              ? t('Compression saved {percent}% before password protection ({before} KB → {after} KB).', {
                percent: Math.round((1 - compressionInfo.afterBytes / compressionInfo.beforeBytes) * 100),
                before: new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(compressionInfo.beforeBytes / 1024),
                after: new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(compressionInfo.afterBytes / 1024),
              })
              : t('Compression did not reduce this file’s size.')}</>}
          </div>}
        </Editor> : editor === 'unavailable'
          ? <div className="notice" role="alert">{t('The editing tools couldn’t load. Your documents are still in this tab. To try again, reload and reopen your original files.')}</div>
          : <p className="sub" role="status">{t('Preparing pages…')}</p>}
      </>}
    </div>
    <RecoveryPanel importDocument={importDocument} locked={locked || Boolean(activePage)} onRestoring={setRestoring} onPending={setRecoveryPending} />
    <details className="shortcut-help"><summary>{t('Keyboard shortcuts')}</summary>
      <dl><dt>Ctrl / ⌘ Z</dt><dd>{t('Undo')}</dd><dt>Ctrl / ⌘ Shift Z · Ctrl Y</dt><dd>{t('Redo')}</dd>
        <dt>Ctrl / ⌘ A</dt><dd>{t('Select all pages')}</dd><dt>Ctrl / ⌘ D</dt><dd>{t('Duplicate selected pages')}</dd>
        <dt>Delete / Backspace</dt><dd>{t('Delete selected pages')}</dd><dt>Escape</dt><dd>{t('Deselect all')}</dd><dt>Ctrl / ⌘ S</dt><dd>{t('Save PDF with the current Save options')}</dd></dl>
      <p>{t('Shortcuts pause while typing, dragging, processing or using a dialog.')}</p>
    </details>
    {!ws.pages.length && <RelatedTools />}
    {fileInput}{passwordDialog}
  </main>;
}
