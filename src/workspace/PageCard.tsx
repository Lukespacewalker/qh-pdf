import { useCallback, useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ImportedDocument, PdfEngine } from '../engine/PdfEngine';
import { isAbortError } from '../engine/abort';
import type { WorkspacePage } from '../domain/workspace';
import { useWorkspaceStore } from './useWorkspaceStore';

export function PageCard({ page, index, doc, engine, disabled, last, onPreview }: {
  page: WorkspacePage; index: number; doc: ImportedDocument; engine: PdfEngine;
  disabled: boolean; last: boolean; onPreview: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: page.id, disabled });
  const element = useRef<HTMLElement | null>(null);
  const ref = useCallback((node: HTMLElement | null) => { element.current = node; setNodeRef(node); }, [setNodeRef]);
  const [nearby, setNearby] = useState(false);
  const [thumb, setThumb] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const selected = useWorkspaceStore(s => s.history.present.selectedPageIds.includes(page.id));
  const select = useWorkspaceStore(s => s.select);
  const move = useWorkspaceStore(s => s.move);

  useEffect(() => {
    if (!element.current) return;
    if (typeof IntersectionObserver === 'undefined') { setNearby(true); return; }
    const observer = new IntersectionObserver(entries => setNearby(entries[0].isIntersecting), { rootMargin: '200px' });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let url = '';
    let disposed = false;
    const controller = new AbortController();
    setThumb(''); setPreviewFailed(false);
    if (nearby) engine.renderThumbnail(doc, page.sourcePageIndex, 260, { signal: controller.signal, rotation: page.rotation }).then(blob => {
      if (disposed) return;
      url = URL.createObjectURL(blob); setThumb(url);
    }).catch(error => { if (!disposed && !isAbortError(error)) setPreviewFailed(true); });
    return () => { disposed = true; controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [doc, engine, page.sourcePageIndex, page.rotation, nearby]);

  return <article ref={ref} className={`card ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
    style={{ transform: CSS.Transform.toString(transform), transition }} aria-label={`Page ${index + 1} from ${doc.fileName}`}>
    <div className="page-card-actions">
      <button ref={setActivatorNodeRef} className="drag-handle" {...attributes} {...listeners}
        aria-label={`Drag page ${index + 1} to reorder`} disabled={disabled}><span aria-hidden="true">⠿</span> Drag</button>
      <label className="page-checkbox"><input type="checkbox" checked={selected} disabled={disabled}
        aria-label={`Include page ${index + 1} in selection`} onChange={() => select(page.id, true)} /><span className="sr-only">Select page {index + 1}</span></label>
    </div>
    <button className="preview" style={{ width: '100%', padding: 0 }} aria-label={`Select page ${index + 1} from ${doc.fileName}`}
      disabled={disabled} aria-pressed={selected} onClick={e => select(page.id, e.ctrlKey || e.metaKey, e.shiftKey)}>
      <span className="num">{index + 1}</span>
      {thumb ? <img src={thumb} alt="" draggable={false} /> : <span className="thumbnail-placeholder">{previewFailed ? 'Preview unavailable' : nearby ? 'Loading preview…' : `Page ${index + 1}`}</span>}
    </button>
    <div className="meta"><strong title={doc.fileName}>{doc.fileName}</strong><span>{page.rotation ? `${page.rotation}°` : ''}</span></div>
    <div className="mini">
      <button className="btn" onClick={() => move(page.id, -1)} disabled={disabled || index === 0} aria-label={`Move page ${index + 1} left`}>←</button>
      <button className="btn preview-open" onClick={() => onPreview(page.id)} disabled={disabled} aria-label={`Preview page ${index + 1}`}>Preview</button>
      <button className="btn" onClick={() => move(page.id, 1)} disabled={disabled || last} aria-label={`Move page ${index + 1} right`}>→</button>
    </div>
  </article>;
}
