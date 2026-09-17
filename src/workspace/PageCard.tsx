import { useEffect, useRef, useState } from 'react';
import type { ImportedDocument, PdfEngine } from '../engine/PdfEngine';
import type { WorkspacePage } from '../domain/workspace';
import { useWorkspaceStore } from './useWorkspaceStore';
import { useThumbnailQueue, type ThumbnailTicket } from './useThumbnailQueue';

export function PageCard({ page, index, doc, engine }: {
  page: WorkspacePage; index: number; doc: ImportedDocument; engine: PdfEngine;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const ticketRef = useRef<ThumbnailTicket<Blob> | null>(null);
  const queue = useThumbnailQueue(engine);
  const [thumb, setThumb] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const selected = useWorkspaceStore(s => s.history.present.selectedPageIds.includes(page.id));
  const select = useWorkspaceStore(s => s.select);
  const move = useWorkspaceStore(s => s.move);

  useEffect(() => {
    let url = '';
    let disposed = false;
    setThumb('');
    setPreviewFailed(false);
    const ticket = queue.schedule(
      `${doc.id}:${page.sourcePageIndex}:260`,
      1,
      () => engine.renderThumbnail(doc, page.sourcePageIndex, 260),
    );
    ticketRef.current = ticket;
    ticket.promise.then(blob => {
      if (disposed) return;
      url = URL.createObjectURL(blob);
      setThumb(url);
    }).catch(error => {
      if (!disposed && !(error instanceof DOMException && error.name === 'AbortError')) setPreviewFailed(true);
    });
    return () => {
      disposed = true;
      ticket.cancel();
      if (ticketRef.current === ticket) ticketRef.current = null;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc, engine, page.sourcePageIndex, queue]);

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      ticketRef.current?.setPriority(0);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      ticketRef.current?.setPriority(entries[0]?.isIntersecting ? 0 : 1);
    }, { rootMargin: '500px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <article ref={cardRef} className={`card ${selected ? 'selected' : ''}`} aria-label={`Page ${index + 1} from ${doc.fileName}`}>
    <button className="preview" style={{ width: '100%', padding: 0 }}
      aria-label={`Select page ${index + 1} from ${doc.fileName}`}
      aria-pressed={selected} onClick={e => select(page.id, e.ctrlKey || e.metaKey)}>
      <span className="num">{index + 1}</span>
      {thumb && <img src={thumb} alt="" style={{ transform: `rotate(${page.rotation}deg)` }} />}
      {previewFailed && <span role="status">Preview unavailable</span>}
    </button>
    <div className="meta"><strong title={doc.fileName}>{doc.fileName}</strong><span>{page.rotation ? `${page.rotation}°` : ''}</span></div>
    <div className="mini">
      <button className="btn" onClick={() => move(page.id, -1)} disabled={index === 0} aria-label={`Move page ${index + 1} left`}>←</button>
      <button className="btn" onClick={() => move(page.id, 1)} aria-label={`Move page ${index + 1} right`}>→</button>
    </div>
  </article>;
}
