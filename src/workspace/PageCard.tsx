import { useCallback, useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ImportedDocument, PdfEngine } from '../engine/PdfEngine';
import type { ThumbnailScheduler } from '../engine/ThumbnailScheduler';
import type { WorkspacePage } from '../domain/workspace';
import { useWorkspaceStore } from './useWorkspaceStore';

export function PageCard({ page, index, doc, engine, scheduler, disabled, last, onPreview }: {
  page: WorkspacePage; index: number; doc: ImportedDocument; engine: PdfEngine; scheduler: ThumbnailScheduler; disabled: boolean; last: boolean;
  onPreview: (pageId: string, opener: HTMLButtonElement) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: page.id, disabled });
  const [thumb, setThumb] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const [cardNode, setCardNode] = useState<HTMLElement | null>(null);
  const [thumbnailPriority, setThumbnailPriority] = useState<number | null>(null);
  const selected = useWorkspaceStore(s => s.history.present.selectedPageIds.includes(page.id));
  const select = useWorkspaceStore(s => s.select);
  const move = useWorkspaceStore(s => s.move);
  const setCardRef = useCallback((node: HTMLElement | null) => {
    setNodeRef(node);
    setCardNode(node);
  }, [setNodeRef]);

  useEffect(() => {
    if (!cardNode) return;
    if (typeof IntersectionObserver === 'undefined') {
      setThumbnailPriority(100);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        setThumbnailPriority(null);
        return;
      }
      const visible = entry.boundingClientRect.bottom >= 0 && entry.boundingClientRect.top <= window.innerHeight;
      setThumbnailPriority(visible ? 100 : 10);
    }, { rootMargin: '600px 0px' });
    observer.observe(cardNode);
    return () => observer.disconnect();
  }, [cardNode]);

  useEffect(() => {
    setThumb('');
    setPreviewFailed(false);
    if (thumbnailPriority === null) return;
    let url = '';
    let disposed = false;
    const job = scheduler.schedule(() => engine.renderThumbnail(doc, page.sourcePageIndex, 260), thumbnailPriority);
    job.promise.then(blob => {
      if (disposed) return;
      url = URL.createObjectURL(blob);
      setThumb(url);
    }).catch(error => {
      if (!disposed && (!(error instanceof DOMException) || error.name !== 'AbortError')) setPreviewFailed(true);
    });
    return () => {
      disposed = true;
      job.cancel();
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc, engine, page.sourcePageIndex, scheduler, thumbnailPriority]);

  return <article ref={setCardRef} className={`card ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
    style={{ transform: CSS.Transform.toString(transform), transition }} aria-label={`Page ${index + 1} from ${doc.fileName}`}>
    <button ref={setActivatorNodeRef} className="drag-handle" {...attributes} {...listeners}
      aria-label={`Drag page ${index + 1} to reorder`} disabled={disabled}><span aria-hidden="true">⠿</span> Drag</button>
    <button className="page-thumbnail" style={{ width: '100%', padding: 0 }}
      aria-label={`Select page ${index + 1} from ${doc.fileName}`}
      disabled={disabled} aria-pressed={selected} onClick={e => select(page.id, e.ctrlKey || e.metaKey)}>
      <span className="num">{index + 1}</span>
      {thumb && <img src={thumb} alt="" draggable={false} style={{ transform: `rotate(${page.rotation}deg)` }} />}
      {previewFailed && <span role="status">Preview unavailable</span>}
    </button>
    <div className="meta"><strong title={doc.fileName}>{doc.fileName}</strong><span>{page.rotation ? `${page.rotation}°` : ''}</span></div>
    <button className="btn page-preview-button" type="button" disabled={disabled}
      aria-label={`Preview page ${index + 1} from ${doc.fileName}`}
      onClick={event => onPreview(page.id, event.currentTarget)}>Preview</button>
    <div className="mini">
      <button className="btn" onClick={() => move(page.id, -1)} disabled={disabled || index === 0} aria-label={`Move page ${index + 1} left`}>←</button>
      <button className="btn" onClick={() => move(page.id, 1)} disabled={disabled || last} aria-label={`Move page ${index + 1} right`}>→</button>
    </div>
  </article>;
}
