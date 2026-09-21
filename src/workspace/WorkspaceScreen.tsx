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
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [recoveryPending, setRecoveryPending] = useState(true);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ pageId: string; opener: HTMLButtonElement } | null>(null);
  const [done, setDone] = useState(false);
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

  async function add(files: File[]) {
    if (editLocked || files.length === 0) return;
    setDone(false);
    setExportNotice('');
    await store.addFiles(files, importDocument);
  }
  async function save(target: SaveTarget, password?: string) {
    if (editLocked) return false;
    store.clearError();
    const current = useWorkspaceStore.getState();
    let snapshot: WorkspaceState;
    try {
      snapshot = target === 'selected'
        ? createSelectedExportWorkspace(current.history.present)
        : {
          pages: current.history.present.pages.map(page => ({ ...page })),
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
    setExportNotice('');
    setExportTotal(snapshot.pages.length);
    setExportProgress({ phase: 'assembling', completed: 0, total: snapshot.pages.length });
    try {
      const blob = await engine.exportWorkspace(documents, snapshot, {
        ...(password === undefined ? {} : { password }),
        signal: controller.signal,
        onProgress: setExportProgress,
      });
      download(blob, target === 'selected' ? 'quack-honk-selected-pages.pdf' : 'quack-honk-document.pdf');
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
    aria-label="Import document files" accept="application/pdf,image/jpeg,image/png,image/webp"
    disabled={editLocked} onChange={event => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = '';
      void add(files);
    }} />;
  const historyActions = <div className="history-tools">
    <button className="btn" onClick={store.undo} disabled={editLocked || !store.history.past.length}>Undo</button>
    <button className="btn" onClick={store.redo} disabled={editLocked || !store.history.future.length}>Redo</button>
  </div>;
  const error = store.error && <div className="notice" role="alert">{store.error}</div>;

  return <main className={`shell workspace-layout ${!ws.pages.length ? 'empty-wrap' : ''}`}>
    <div className="workspace-content">
      {!ws.pages.length ? <>
        <section className={`drop ${drag ? 'drag' : ''}`}
          onDragOver={event => { event.preventDefault(); if (!editLocked) setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={event => { event.preventDefault(); setDrag(false); void add(Array.from(event.dataTransfer.files)); }}>
          <MascotState state={store.busy ? 'working' : 'empty'} alt={store.busy ? 'Quack working' : 'Quack welcoming you to the workspace'} />
          <h1>Combine files. Arrange pages.</h1>
          <p className="drop-intro">Combine documents, rearrange pages, or turn pictures into a PDF.<br className="desktop-break" /> Drop your files here to get started.</p>
          {error}
          <button className="btn primary file-btn" aria-describedby="supported-formats" onClick={() => input.current?.click()} disabled={editLocked}>
            {store.busy ? 'Preparing pages…' : 'Choose files'}
          </button>
          <p className="formats" id="supported-formats">PDF · JPG / JPEG · PNG · WebP</p>
          <div className="privacy">Your documents stay on this device.</div>
          <p className="free-note">Free to use. No account needed.</p>
          {(store.history.past.length > 0 || store.history.future.length > 0) &&
            <div aria-label="Document history">{historyActions}</div>}
        </section>
        <Capabilities />
      </> : <>
        <div className="head">
          <div><h1>Your document</h1><p className="sub">{ws.pages.length} pages</p></div>
          <button className="btn" onClick={() => input.current?.click()} disabled={editLocked}>+ Add files</button>
        </div>
        {error}
        <div className="toolbar" role="group" aria-label="Page editing tools">
          {historyActions}
          <div className="selection-tools" role="group" aria-label="Page selection tools">
            <button className="btn" onClick={store.selectAll} disabled={editLocked || selected === ws.pages.length}>Select all</button>
            <button className="btn" onClick={store.deselectAll} disabled={editLocked || !selected}>Deselect all</button>
            <output className="selection-count" role="status" aria-label="Selected pages">{selected} of {ws.pages.length} selected</output>
          </div>
          <span className="spacer" />
          <div className="edit-tools">
            <button className="btn" aria-label="Rotate left" onClick={() => store.rotate(-90)} disabled={editLocked || !selected}>↶ Rotate</button>
            <button className="btn" aria-label="Rotate right" onClick={() => store.rotate(90)} disabled={editLocked || !selected}>Rotate ↷</button>
            <button className="btn" onClick={store.duplicate} disabled={editLocked || !selected}>Duplicate</button>
            <button className="btn danger" onClick={store.remove} disabled={editLocked || !selected}>Delete</button>
          </div>
        </div>
        <p className="arrange-hint">Click a page to select it, use Shift for a range, or Ctrl / Command to add pages. The checkbox adds a page on touch and keyboard. Drag the handle or use arrows to reorder.</p>
        <DndContext sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)}
          accessibility={{ announcements: {
            onDragStart: ({ active }) => `Picked up page ${ws.pages.findIndex(page => page.id === active.id) + 1}.`,
            onDragOver: ({ over }) => over ? `Move to position ${ws.pages.findIndex(page => page.id === over.id) + 1}.` : 'Outside the page area. Drop to cancel.',
            onDragEnd: ({ over }) => over ? `Page moved to position ${ws.pages.findIndex(page => page.id === over.id) + 1}.` : 'Page move cancelled.',
            onDragCancel: () => 'Page move cancelled.',
          } }}
          onDragStart={event => setActivePage(String(event.active.id))}
          onDragCancel={() => setActivePage(null)}
          onDragEnd={({ active, over }) => {
            if (!locked && over) store.reorder(String(active.id), String(over.id));
            setActivePage(null);
          }}>
          <SortableContext items={ws.pages.map(page => page.id)} strategy={rectSortingStrategy}>
            <section className="grid" aria-label="Document pages">{ws.pages.map((page, index) => {
              const doc = store.documents.get(page.sourceDocumentId);
              if (!doc) return <div className="notice" role="alert" key={page.id}>The source for page {index + 1} is missing. Undo the last change or add the document again.</div>;
              return <PageCard key={page.id} page={page} index={index} doc={doc} engine={engine}
                scheduler={thumbnailScheduler} disabled={locked || recoveryPending} selectionDisabled={editLocked}
                last={index === ws.pages.length - 1}
                onPreview={(pageId, opener) => setPreview({ pageId, opener })} />;
            })}</section>
          </SortableContext>
          <DragOverlay>{activePage ? <div className="drag-overlay">Moving page {ws.pages.findIndex(page => page.id === activePage) + 1}</div> : null}</DragOverlay>
        </DndContext>
        <SavePanel count={ws.pages.length} selectedCount={selected} locked={editLocked} exporting={exporting} onSave={save} onCancel={cancelExport} />
        {exporting && <div className="status" role="status"><MascotState state="working" alt="Quack working" /><div className="export-status">
          <strong>{exportProgress?.phase === 'protecting' ? 'Protecting your PDF…' :
            `Creating page ${exportProgress?.completed ?? 0} of ${exportProgress?.total ?? exportTotal}…`}</strong>
          <progress aria-label="Creating PDF" max={exportProgress?.total ?? exportTotal}
            value={exportProgress?.completed ?? 0} />
          <div className="sub">Everything is being processed in this browser.</div>
        </div></div>}
        {exportNotice && <div className="save-complete" role="status">{exportNotice}</div>}
        {done && <div className="save-complete" role="status"><strong>Your PDF is ready.</strong> Created without uploading your document.</div>}
      </>}
    </div>
    <RecoveryPanel importDocument={importDocument} locked={locked || Boolean(activePage)} onRestoring={setRestoring} onPending={setRecoveryPending} />
    <BrandBanner />
    {preview && <FullPagePreviewDialog pageId={preview.pageId} pages={ws.pages} documents={store.documents}
      engine={engine} opener={preview.opener} onNavigate={pageId => setPreview(current => current ? { ...current, pageId } : null)}
      onRotate={store.rotatePage} onClose={() => setPreview(null)} />}
    {fileInput}{passwordDialog}
  </main>;
}
