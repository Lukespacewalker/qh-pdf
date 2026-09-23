import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { MascotState } from '../brand/MascotState';
import { BrandBanner } from '../brand/BrandBanner';
import { createSelectedExportWorkspace, type WorkspaceState } from '../domain/workspace';
import type { ExportProgress, PdfEngine } from '../engine/PdfEngine';
import { ThumbnailScheduler } from '../engine/ThumbnailScheduler';
import { RecoveryPanel } from '../recovery/RecoveryPanel';
import { FullPagePreviewDialog } from './FullPagePreviewDialog';
import { PageCard } from './PageCard';
import { Capabilities } from './Capabilities';
import { SavePanel, type SaveTarget } from './SavePanel';
import { usePasswordImport } from './usePasswordImport';
import { useWorkspaceStore } from './useWorkspaceStore';
import { CropDialog } from './CropDialog';
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
  const [preview, setPreview] = useState<{ pageId: string; opener: HTMLButtonElement } | null>(null);
  const [cropOpener, setCropOpener] = useState<HTMLButtonElement | null>(null);
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
  const editLocked = locked || recoveryPending || Boolean(activePage);
  const selected = ws.selectedPageIds.length;
  const { importDocument, passwordDialog } = usePasswordImport(engine);
  const thumbnailScheduler = useMemo(() => new ThumbnailScheduler(2), []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
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
    let snapshot: WorkspaceState;
    try {
      snapshot = target === 'selected'
        ? createSelectedExportWorkspace(current.history.present)
        : {
          pages: current.history.present.pages.map(page => ({ ...page, ...(page.crop && { crop: { ...page.crop } }) })),
          selectedPageIds: [...current.history.present.selectedPageIds],
        };
    } catch (error) {
      useWorkspaceStore.setState({ error: error instanceof Error ? error.message : 'Export failed' });
      return false;
    }
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
      useWorkspaceStore.setState({ error: error instanceof Error ? error.message : 'Export failed' });
      return false;
    } finally {
      if (exportJob.current === controller) exportJob.current = null;
      setExportProgress(null);
      setExporting(false);
    }
  }
  function cancelExport() { exportJob.current?.abort(); }
  const fileInput = <input ref={input} className="hidden-input" type="file" multiple
    aria-label={t('Import document files')} accept="application/pdf,image/jpeg,image/png,image/webp"
    disabled={editLocked} onChange={event => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = '';
      void add(files);
    }} />;
  const historyActions = <div className="history-tools">
    <button className="btn" onClick={store.undo} disabled={editLocked || !store.history.past.length}>{t('Undo')}</button>
    <button className="btn" onClick={store.redo} disabled={editLocked || !store.history.future.length}>{t('Redo')}</button>
  </div>;
  const error = store.error && <div className="notice" role="alert">{t(store.error)}</div>;

  return <main className={`shell workspace-layout ${!ws.pages.length ? 'empty-wrap' : ''}`}>
    <div className="workspace-content">
      {!ws.pages.length ? <>
        <section className={`drop ${drag ? 'drag' : ''}`}
          onDragOver={event => { event.preventDefault(); if (!editLocked) setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={event => { event.preventDefault(); setDrag(false); void add(Array.from(event.dataTransfer.files)); }}>
          <MascotState state={store.busy ? 'working' : 'empty'} alt={store.busy ? t('Quack working') : t('Quack welcoming you to the workspace')} />
          <h1>{t('Combine files. Arrange pages.')}</h1>
          <p className="drop-intro">{t('Combine documents, rearrange pages, or turn pictures into a PDF.')}<br className="desktop-break" /> {t('Drop your files here to get started.')}</p>
          {error}
          <button className="btn primary file-btn" aria-describedby="supported-formats" onClick={() => input.current?.click()} disabled={editLocked}>
            {store.busy ? t('Preparing pages…') : t('Choose files')}
          </button>
          <p className="formats" id="supported-formats">PDF · JPG / JPEG · PNG · WebP</p>
          <div className="privacy">{t('Your documents stay on this device.')}</div>
          <p className="free-note">{t('Free to use. No account needed.')}</p>
          {(store.history.past.length > 0 || store.history.future.length > 0) &&
            <div aria-label={t('Document history')}>{historyActions}</div>}
        </section>
        <Capabilities />
      </> : <>
        <div className="head">
          <div><h1>{t('Your document')}</h1><p className="sub">{t('{count} pages', { count: ws.pages.length })}</p></div>
          <button className="btn" onClick={() => input.current?.click()} disabled={editLocked}>+ {t('Add files')}</button>
        </div>
        {error}
        <div className="page-editing-region">
        <div className="toolbar" role="group" aria-label={t('Page editing tools')}>
          {historyActions}
          <div className="selection-tools" role="group" aria-label={t('Page selection tools')}>
            <button className="btn" onClick={store.selectAll} disabled={editLocked || selected === ws.pages.length}>{t('Select all')}</button>
            <button className="btn" onClick={store.deselectAll} disabled={editLocked || !selected}>{t('Deselect all')}</button>
            <output className="selection-count" role="status" aria-label={t('Selected pages')}>{t('{selected} of {total} selected', { selected, total: ws.pages.length })}</output>
          </div>
          <span className="spacer" />
          <div className="edit-tools">
            <button className="btn" aria-label={t('Rotate left')} onClick={() => store.rotate(-90)} disabled={editLocked || !selected}>↶ {t('Rotate')}</button>
            <button className="btn" aria-label={t('Rotate right')} onClick={() => store.rotate(90)} disabled={editLocked || !selected}>{t('Rotate')} ↷</button>
            <button className="btn" onClick={store.duplicate} disabled={editLocked || !selected}>{t('Duplicate')}</button>
            <button className="btn danger" onClick={store.remove} disabled={editLocked || !selected}>{t('Delete')}</button>
            <button className="btn" onClick={event => setCropOpener(event.currentTarget)} disabled={editLocked || !selected}>{t('Crop')}</button>
          </div>
        </div>
        <p className="arrange-hint">{t('Click a page to select it, use Shift for a range, or Ctrl / Command to add pages. The checkbox adds a page on touch and keyboard. Drag the handle or use arrows to reorder.')}</p>
        <DndContext sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)}
          accessibility={{ screenReaderInstructions: {
            draggable: t('To pick up a page, press Space. While moving, use the arrow keys. Press Space again to drop, or Escape to cancel.'),
          }, announcements: {
            onDragStart: ({ active }) => t('Picked up page {page}.', { page: ws.pages.findIndex(page => page.id === active.id) + 1 }),
            onDragOver: ({ over }) => over ? t('Move to position {position}.', { position: ws.pages.findIndex(page => page.id === over.id) + 1 }) : t('Outside the page area. Drop to cancel.'),
            onDragEnd: ({ over }) => over ? t('Page moved to position {position}.', { position: ws.pages.findIndex(page => page.id === over.id) + 1 }) : t('Page move cancelled.'),
            onDragCancel: () => t('Page move cancelled.'),
          } }}
          onDragStart={event => setActivePage(String(event.active.id))}
          onDragCancel={() => setActivePage(null)}
          onDragEnd={({ active, over }) => {
            if (!locked && over) store.reorder(String(active.id), String(over.id));
            setActivePage(null);
          }}>
          <SortableContext items={ws.pages.map(page => page.id)} strategy={rectSortingStrategy}>
            <section className="grid" aria-label={t('Document pages')}>{ws.pages.map((page, index) => {
              const doc = store.documents.get(page.sourceDocumentId);
              if (!doc) return <div className="notice" role="alert" key={page.id}>{t('The source for page {page} is missing. Undo the last change or add the document again.', { page: index + 1 })}</div>;
              return <PageCard key={page.id} page={page} index={index} doc={doc} engine={engine}
                scheduler={thumbnailScheduler} disabled={locked || recoveryPending} selectionDisabled={editLocked}
                last={index === ws.pages.length - 1}
                onPreview={(pageId, opener) => setPreview({ pageId, opener })} />;
            })}</section>
          </SortableContext>
          <DragOverlay>{activePage ? <div className="drag-overlay">{t('Moving page {page}', { page: ws.pages.findIndex(page => page.id === activePage) + 1 })}</div> : null}</DragOverlay>
        </DndContext>
        </div>
        <SavePanel count={ws.pages.length} selectedCount={selected} locked={editLocked} exporting={exporting} onSave={save} onCancel={cancelExport} saveButtonRef={saveButton}
          engine={engine} workspace={ws} documents={store.documents} />
        {exporting && <div className="status" role="status"><MascotState state="working" alt={t('Quack working')} /><div className="export-status">
          <strong>{exportProgress?.phase === 'protecting' ? t('Protecting your PDF…') : exportProgress?.phase === 'compressing' ? t('Compressing your PDF…') :
            t('Creating page {current} of {total}…', { current: exportProgress?.completed ?? 0, total: exportProgress?.total ?? exportTotal })}</strong>
          <progress aria-label={t('Creating PDF')} max={exportProgress?.total ?? exportTotal}
            value={exportProgress?.completed ?? 0} />
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
            : t('Compression did not reduce this file’s size.')}{' '}
            {t('Compression is compared before password protection.')}</>}
        </div>}
      </>}
    </div>
    <RecoveryPanel importDocument={importDocument} locked={locked || Boolean(activePage)} onRestoring={setRestoring} onPending={setRecoveryPending} />
    <BrandBanner />
    <details className="shortcut-help"><summary>{t('Keyboard shortcuts')}</summary>
      <dl><dt>Ctrl / ⌘ Z</dt><dd>{t('Undo')}</dd><dt>Ctrl / ⌘ Shift Z · Ctrl Y</dt><dd>{t('Redo')}</dd>
        <dt>Ctrl / ⌘ A</dt><dd>{t('Select all pages')}</dd><dt>Ctrl / ⌘ D</dt><dd>{t('Duplicate selected pages')}</dd>
        <dt>Delete / Backspace</dt><dd>{t('Delete selected pages')}</dd><dt>Escape</dt><dd>{t('Deselect all')}</dd><dt>Ctrl / ⌘ S</dt><dd>{t('Save PDF with the current Save options')}</dd></dl>
      <p>{t('Shortcuts pause while typing, dragging, processing or using a dialog.')}</p>
    </details>
    {preview && <FullPagePreviewDialog pageId={preview.pageId} pages={ws.pages} documents={store.documents}
      engine={engine} opener={preview.opener} onNavigate={pageId => setPreview(current => current ? { ...current, pageId } : null)}
      onRotate={store.rotatePage} onClose={() => setPreview(null)} />}
    {fileInput}{passwordDialog}
    {cropOpener && (() => {
      const page = ws.pages.find(page => ws.selectedPageIds.includes(page.id));
      const document = page && store.documents.get(page.sourceDocumentId);
      return page && document ? <CropDialog page={page} document={document} count={selected} engine={engine}
        opener={cropOpener} onApply={store.crop} onClose={() => setCropOpener(null)} /> : null;
    })()}
  </main>;
}
