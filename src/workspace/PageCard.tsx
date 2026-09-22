import { useCallback, useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ImportedDocument, PdfEngine } from '../engine/PdfEngine';
import type { ThumbnailScheduler } from '../engine/ThumbnailScheduler';
import type { WorkspacePage } from '../domain/workspace';
import { useWorkspaceStore } from './useWorkspaceStore';

export function PageCard({ page, index, doc, engine, scheduler, disabled, selectionDisabled, last, onPreview }: {
  page: WorkspacePage; index: number; doc: ImportedDocument; engine: PdfEngine; scheduler: ThumbnailScheduler; disabled: boolean; selectionDisabled: boolean; last: boolean;
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
    const controller = new AbortController();
    const job = scheduler.schedule(() => page.crop
      ? engine.renderPage(doc, page.sourcePageIndex, { maxWidth: 260, maxHeight: 1000, rotation: page.rotation, crop: page.crop, signal: controller.signal })
      : engine.renderThumbnail(doc, page.sourcePageIndex, 260), thumbnailPriority);
    job.promise.then(blob => {
      if (disposed) return;
      url = URL.createObjectURL(blob);
      setThumb(url);
    }).catch(error => {
      if (!disposed && (!(error instanceof DOMException) || error.name !== 'AbortError')) setPreviewFailed(true);
    });
    return () => {
      disposed = true;
      controller.abort();
      job.cancel();
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc, engine, page.sourcePageIndex, page.crop, page.rotation, scheduler, thumbnailPriority]);

  return <article ref={setCardRef} className={`card ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
    style={{ transform: CSS.Transform.toString(transform), transition }} aria-label={`Page ${index + 1} from ${doc.fileName}`}
    onFocusCapture={event => {
      const toolbar = document.querySelector<HTMLElement>('.toolbar');
      if (!toolbar || !(event.target instanceof HTMLElement)) return;
      if (!event.target.matches(':focus-visible')) return;
      const toolbarRect = toolbar.getBoundingClientRect();
      const targetRect = event.target.getBoundingClientRect();
      if (targetRect.top < toolbarRect.bottom + 8 && targetRect.bottom > toolbarRect.top) {
        event.target.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
    }}>
    <div className="card-top-controls">
      <button ref={setActivatorNodeRef} className="drag-handle" {...attributes} {...listeners}
        aria-label={`Drag page ${index + 1} to reorder`} disabled={disabled}><span aria-hidden="true">⠿</span> Drag</button>
      <label className="page-selection">
        <input type="checkbox" checked={selected} disabled={selectionDisabled}
          aria-label={selected
            ? `Remove page ${index + 1} from selection (${doc.fileName})`
            : `Add page ${index + 1} from ${doc.fileName} to selection`}
          onChange={() => select(page.id, { additive: true, range: false })} />
        <span>{selected ? 'Selected' : 'Select'}</span>
      </label>
    </div>
    <button className="page-thumbnail" style={{ width: '100%', padding: 0 }}
      aria-label={`Select page ${index + 1} from ${doc.fileName}`}
      disabled={selectionDisabled} aria-pressed={selected}
      onClick={event => select(page.id, { additive: event.ctrlKey || event.metaKey, range: event.shiftKey })}>
      <span className="num">{index + 1}</span>
      {thumb && <img src={thumb} alt="" draggable={false} style={{ transform: `rotate(${page.crop ? 0 : page.rotation}deg)` }} />}
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
