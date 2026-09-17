import { useEffect, useRef, useState } from 'react';
import { MascotState } from '../brand/MascotState';
import type { PdfEngine } from '../engine/PdfEngine';
import { PageCard } from './PageCard';
import { useWorkspaceStore } from './useWorkspaceStore';

function download(blob: Blob) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = 'quack-honk-document.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function WorkspaceScreen({ engine }: { engine: PdfEngine }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const store = useWorkspaceStore();
  const ws = store.history.present;
  const locked = store.busy || exporting;
  const selected = ws.selectedPageIds.length;
  useEffect(() => { setDone(false); }, [ws.pages]);

  async function add(files: File[]) {
    if (locked || files.length === 0) return;
    setDone(false);
    await store.addFiles(files, engine);
  }
  async function save() {
    if (locked || ws.pages.length === 0) return;
    setExporting(true);
    setDone(false);
    store.clearError();
    try {
      const blob = await engine.exportWorkspace(store.documents, ws);
      download(blob);
      setDone(true);
    } catch (error) {
      useWorkspaceStore.setState({ error: error instanceof Error ? error.message : 'Export failed' });
    } finally {
      setExporting(false);
    }
  }
  const fileInput = <input ref={input} className="hidden-input" type="file" multiple
    aria-label="Choose files" accept="application/pdf,image/jpeg,image/png,image/webp"
    disabled={locked} onChange={event => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = '';
      void add(files);
    }} />;
  const historyActions = <>
    <button className="btn" onClick={store.undo} disabled={locked || !store.history.past.length}>Undo</button>
    <button className="btn" onClick={store.redo} disabled={locked || !store.history.future.length}>Redo</button>
  </>;
  const error = store.error && <div className="notice" role="alert">{store.error}</div>;

  if (!ws.pages.length) return <main className="shell empty-wrap">
    <section className={`drop ${drag ? 'drag' : ''}`}
      onDragOver={event => { event.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={event => {
        event.preventDefault(); setDrag(false);
        void add(Array.from(event.dataTransfer.files));
      }}>
      <MascotState state={store.busy ? 'working' : 'empty'} alt={store.busy ? 'Quack working' : 'Quack welcoming you to the workspace'} />
      <h1>Put your pages in order.</h1>
      <p>Drop PDFs or images here. Arrange everything visually, then save one clean PDF.</p>
      {error}{fileInput}
      <button className="btn primary file-btn" onClick={() => input.current?.click()} disabled={locked}>
        {store.busy ? 'Preparing pages…' : 'Choose files'}
      </button>
      <div className="privacy">🔒 Your documents stay on this device.</div>
      {(store.history.past.length > 0 || store.history.future.length > 0) &&
        <div aria-label="Document history">{historyActions}</div>}
    </section>
  </main>;

  return <main className="shell">
    <div className="head">
      <div><h1>Your document</h1><p className="sub">{ws.pages.length} pages · {selected ? `${selected} selected` : 'Select pages to edit'}</p></div>
      <button className="btn" onClick={() => input.current?.click()} disabled={locked}>+ Add files</button>
    </div>
    {error}
    <div className="toolbar">
      {historyActions}<span className="spacer" />
      <button className="btn" aria-label="Rotate left" onClick={() => store.rotate(-90)} disabled={locked || !selected}>↶ Rotate</button>
      <button className="btn" aria-label="Rotate right" onClick={() => store.rotate(90)} disabled={locked || !selected}>Rotate ↷</button>
      <button className="btn" onClick={store.duplicate} disabled={locked || !selected}>Duplicate</button>
      <button className="btn danger" onClick={store.remove} disabled={locked || !selected}>Delete</button>
      <button className="btn primary" onClick={save} disabled={locked}>{exporting ? 'Creating PDF…' : 'Save PDF'}</button>
    </div>
    {fileInput}
    <section className="grid">{ws.pages.map((page, index) => {
      const doc = store.documents.get(page.sourceDocumentId);
      if (!doc) return <div className="notice" role="alert" key={page.id}>The source for page {index + 1} is missing. Undo the last change or add the document again.</div>;
      return <PageCard key={page.id} page={page} index={index} doc={doc} engine={engine} />;
    })}</section>
    {exporting && <div className="status" role="status"><MascotState state="working" alt="Quack working" /><div><strong>Creating your PDF…</strong><div className="sub">Everything is being processed in this browser.</div></div></div>}
    {done && <div className="status" role="status"><MascotState state="success" alt="Honk happy" /><div><strong>Your PDF is ready.</strong><div className="sub">Created without uploading your document.</div></div></div>}
  </main>;
}
