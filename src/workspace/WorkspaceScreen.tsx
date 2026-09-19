import { useCallback, useEffect, useRef, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { MascotState } from '../brand/MascotState';
import type { ExportProgress, PdfEngine } from '../engine/PdfEngine';
import { isAbortError } from '../engine/abort';
import { selectedWorkspace } from '../domain/selection';
import { RecoveryPanel } from '../recovery/RecoveryPanel';
import { PageCard } from './PageCard';
import { PagePreview } from './PagePreview';
import { Capabilities } from './Capabilities';
import { SavePanel } from './SavePanel';
import { usePasswordImport } from './usePasswordImport';
import { useWorkspaceStore } from './useWorkspaceStore';
import { useWorkspaceShortcuts } from './useWorkspaceShortcuts';
import './upgrades.css';

function download(blob: Blob, selectedOnly: boolean) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = selectedOnly ? 'quack-honk-selected-pages.pdf' : 'quack-honk-document.pdf';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function WorkspaceScreen({ engine }: { engine: PdfEngine }) {
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [drag, setDrag] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [recoveryPending, setRecoveryPending] = useState(true);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const closePreview = useCallback(() => setPreviewId(null), []);
  const [done, setDone] = useState(false);
  const store = useWorkspaceStore();
  const ws = store.history.present;
  const locked = store.busy || exporting || restoring;
  const editLocked = locked || recoveryPending || Boolean(activePage) || Boolean(previewId);
  const selected = ws.selectedPageIds.length;
  const { importDocument, passwordDialog } = usePasswordImport(engine);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  useWorkspaceShortcuts(!editLocked);
  useEffect(() => { setDone(false); setCancelled(false); }, [ws.pages]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);

  async function add(files: File[]) {
    if (editLocked || controller.current || files.length === 0) return;
    setDone(false); setCancelled(false);
    await store.addFiles(files, importDocument);
  }
  async function save(password?: string, selectedOnly = false) {
    if (editLocked || controller.current || ws.pages.length === 0) return false;
    const snapshot = selectedOnly ? selectedWorkspace(ws) : ws;
    if (!snapshot.pages.length) return false;
    const job = new AbortController();
    controller.current = job;
    setExporting(true); setDone(false); setCancelled(false);
    setProgress({ phase: 'assembling', completed: 0, total: snapshot.pages.length });
    store.clearError();
    try {
      const blob = await engine.exportWorkspace(store.documents, snapshot, {
        ...(password !== undefined && { password }), signal: job.signal,
        onProgress: value => { if (mounted.current && controller.current === job && !job.signal.aborted) setProgress(value); },
      });
      if (!mounted.current || controller.current !== job || job.signal.aborted) return false;
      download(blob, selectedOnly); setDone(true); return true;
    } catch (error) {
      if (mounted.current && controller.current === job) {
        if (isAbortError(error)) setCancelled(true);
        else useWorkspaceStore.setState({ error: error instanceof Error ? error.message : 'Export failed' });
      }
      return false;
    } finally {
      if (controller.current === job) { controller.current = null; if (mounted.current) { setExporting(false); setProgress(null); } }
    }
  }
  const fileInput = <input ref={input} className="hidden-input" type="file" multiple
    aria-label="Import document files" accept="application/pdf,image/jpeg,image/png,image/webp"
    disabled={editLocked} onChange={event => {
      const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void add(files);
    }} />;
  const historyActions = <>
    <button className="btn" onClick={store.undo} disabled={editLocked || !store.history.past.length}>Undo</button>
    <button className="btn" onClick={store.redo} disabled={editLocked || !store.history.future.length}>Redo</button>
  </>;
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
          {(store.history.past.length > 0 || store.history.future.length > 0) && <div aria-label="Document history">{historyActions}</div>}
        </section>
        <Capabilities />
      </> : <>
        <div className="head">
          <div><h1>Your document</h1><p className="sub">{ws.pages.length} pages · {selected ? `${selected} selected` : 'Select pages to edit'}</p></div>
          <button className="btn" onClick={() => input.current?.click()} disabled={editLocked}>+ Add files</button>
        </div>
        {error}
        <div className="toolbar" role="group" aria-label="Page editing tools">
          {historyActions}<span className="spacer" />
          <button className="btn" aria-label="Rotate left" onClick={() => store.rotate(-90)} disabled={editLocked || !selected}>↶ Rotate</button>
          <button className="btn" aria-label="Rotate right" onClick={() => store.rotate(90)} disabled={editLocked || !selected}>Rotate ↷</button>
          <button className="btn" onClick={store.duplicate} disabled={editLocked || !selected}>Duplicate</button>
          <button className="btn danger" onClick={store.remove} disabled={editLocked || !selected}>Delete</button>
        </div>
        <div className="selection-tools" role="group" aria-label="Page selection">
          <button className="btn" onClick={store.selectAll} disabled={editLocked || selected === ws.pages.length}>Select all</button>
          <button className="btn" onClick={store.clearSelection} disabled={editLocked || !selected}>Deselect all</button>
          <p>Use checkboxes for several pages. Shift-click selects a range.</p>
        </div>
        <p className="arrange-hint">Drag the handle on a page or use its arrows to change the order. Undo is always handy.</p>
        <DndContext sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)}
          accessibility={{ announcements: {
            onDragStart: ({ active }) => `Picked up page ${ws.pages.findIndex(page => page.id === active.id) + 1}.`,
            onDragOver: ({ over }) => over ? `Move to position ${ws.pages.findIndex(page => page.id === over.id) + 1}.` : 'Outside the page area. Drop to cancel.',
            onDragEnd: ({ over }) => over ? `Page moved to position ${ws.pages.findIndex(page => page.id === over.id) + 1}.` : 'Page move cancelled.',
            onDragCancel: () => 'Page move cancelled.',
          } }}
          onDragStart={event => setActivePage(String(event.active.id))}
          onDragCancel={() => setActivePage(null)}
          onDragEnd={({ active, over }) => { if (!locked && !recoveryPending && !previewId && over) store.reorder(String(active.id), String(over.id)); setActivePage(null); }}>
          <SortableContext items={ws.pages.map(page => page.id)} strategy={rectSortingStrategy}>
            <section className="grid" aria-label="Document pages">{ws.pages.map((page, index) => {
              const doc = store.documents.get(page.sourceDocumentId);
              if (!doc) return <div className="notice" role="alert" key={page.id}>The source for page {index + 1} is missing. Undo the last change or add the document again.</div>;
              return <PageCard key={page.id} page={page} index={index} doc={doc} engine={engine}
                disabled={locked || recoveryPending || Boolean(previewId)} last={index === ws.pages.length - 1} onPreview={setPreviewId} />;
            })}</section>
          </SortableContext>
          <DragOverlay>{activePage ? <div className="drag-overlay">Moving page {ws.pages.findIndex(page => page.id === activePage) + 1}</div> : null}</DragOverlay>
        </DndContext>
        <SavePanel count={ws.pages.length} selectedCount={selected} locked={editLocked} exporting={exporting} onSave={save} />
        {cancelled && <p className="save-complete" role="status">Export cancelled. Your pages are unchanged.</p>}
        {done && <div className="save-complete" role="status"><strong>Your PDF is ready.</strong> Created without uploading your document.</div>}
      </>}
    </div>
    <RecoveryPanel importDocument={importDocument} locked={locked || Boolean(activePage) || Boolean(previewId)} onRestoring={setRestoring} onPending={setRecoveryPending} />
    {fileInput}{passwordDialog}
    {previewId && <PagePreview initialId={previewId} pages={ws.pages} documents={store.documents} engine={engine} onClose={closePreview} />}
    {exporting && progress && <section className="export-progress" aria-label="Export progress">
      <div className="progress-message"><strong role="status">{progress.phase === 'assembling' ? `Preparing pages: ${progress.completed} of ${progress.total}` : progress.phase === 'writing' ? 'Writing your PDF…' : 'Protecting your PDF…'}</strong>
        <progress aria-label="PDF export progress" max={progress.total} value={progress.phase === 'assembling' ? progress.completed : undefined} />
        <p>Processing on this device. Cancellation keeps your workspace.</p>
      </div>
      <button className="btn" onClick={() => controller.current?.abort()}>Cancel export</button>
    </section>}
  </main>;
}
