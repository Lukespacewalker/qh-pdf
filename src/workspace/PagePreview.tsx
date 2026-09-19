import { useEffect, useRef, useState } from 'react';
import type { ImportedDocument, PdfEngine } from '../engine/PdfEngine';
import type { WorkspacePage } from '../domain/workspace';
import { isAbortError } from '../engine/abort';
import { useWorkspaceStore } from './useWorkspaceStore';

export function PagePreview({ initialId, pages, documents, engine, onClose }: {
  initialId: string; pages: WorkspacePage[]; documents: ReadonlyMap<string, ImportedDocument>;
  engine: PdfEngine; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [activeId, setActiveId] = useState(initialId);
  const [zoom, setZoom] = useState(100);
  const [image, setImage] = useState('');
  const [error, setError] = useState(false);
  const rotate = useWorkspaceStore(s => s.rotatePage);
  const index = pages.findIndex(page => page.id === activeId);
  const page = pages[index];
  const source = page && documents.get(page.sourceDocumentId);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { if (!page || !source) onClose(); }, [page, source, onClose]);
  useEffect(() => {
    if (!page || !source) return;
    const controller = new AbortController();
    let disposed = false;
    let url = '';
    setImage(''); setError(false);
    engine.renderThumbnail(source, page.sourcePageIndex, 1400, { signal: controller.signal, priority: 0, rotation: page.rotation }).then(blob => {
      if (disposed) return;
      url = URL.createObjectURL(blob); setImage(url);
    }).catch(failure => { if (!disposed && !isAbortError(failure)) setError(true); });
    return () => { disposed = true; controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [source, page?.sourcePageIndex, page?.rotation, engine]);
  function navigate(direction: number) {
    const next = pages[index + direction];
    if (next) { setActiveId(next.id); setZoom(100); }
  }
  return <dialog ref={dialog} className="page-preview-dialog" aria-label="Page preview" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="preview-dialog-header"><h2>Page {index + 1} of {pages.length}</h2><button className="btn" onClick={onClose} aria-label="Close preview">Close</button></div>
    <div className="preview-navigation" role="group" aria-label="Preview controls">
      <button className="btn" onClick={() => navigate(-1)} disabled={index <= 0} aria-label="Previous page">← Previous</button>
      <button className="btn" onClick={() => navigate(1)} disabled={index >= pages.length - 1} aria-label="Next page">Next →</button>
      <span className="spacer" />
      <button className="btn" onClick={() => setZoom(value => Math.max(50, value - 25))} disabled={zoom <= 50} aria-label="Zoom out">−</button>
      <output aria-label="Zoom level">{zoom}%</output>
      <button className="btn" onClick={() => setZoom(value => Math.min(200, value + 25))} disabled={zoom >= 200} aria-label="Zoom in">+</button>
      <button className="btn" onClick={() => setZoom(100)}>Fit page</button>
    </div>
    <div className="full-preview-stage" tabIndex={0} aria-label="Page image. Scroll to see a zoomed page.">
      {image ? <div className="full-preview-canvas" style={{ width: `${zoom}%`, height: `${zoom}%` }}><img src={image} alt={`Page ${index + 1} preview`} draggable={false} /></div> :
        <p role="status">{error ? 'This page preview is unavailable. You can still close this view and work with your pages.' : 'Preparing page preview…'}</p>}
    </div>
    <div className="preview-dialog-footer"><span>Preview only. Original files are unchanged.</span><div>
      <button className="btn" disabled={!page} onClick={() => page && rotate(page.id, -90)} aria-label="Rotate preview left">↶ Rotate</button>
      <button className="btn" disabled={!page} onClick={() => page && rotate(page.id, 90)} aria-label="Rotate preview right">Rotate ↷</button>
    </div></div>
  </dialog>;
}
