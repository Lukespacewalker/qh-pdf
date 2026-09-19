import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ImportedDocument, PdfEngine } from '../engine/PdfEngine';
import type { WorkspacePage } from '../domain/workspace';
import { useWorkspaceStore } from './useWorkspaceStore';

export function PageCard({ page, index, doc, engine, disabled, last }: {
  page: WorkspacePage; index: number; doc: ImportedDocument; engine: PdfEngine; disabled: boolean; last: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: page.id, disabled });
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
    engine.renderThumbnail(doc, page.sourcePageIndex, 260).then(blob => {
      if (disposed) return;
      url = URL.createObjectURL(blob);
      setThumb(url);
    }).catch(() => {
      if (!disposed) setPreviewFailed(true);
    });
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc, engine, page.sourcePageIndex]);

  return <article ref={setNodeRef} className={`card ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
    style={{ transform: CSS.Transform.toString(transform), transition }} aria-label={`Page ${index + 1} from ${doc.fileName}`}>
    <button ref={setActivatorNodeRef} className="drag-handle" {...attributes} {...listeners}
      aria-label={`Drag page ${index + 1} to reorder`} disabled={disabled}><span aria-hidden="true">⠿</span> Drag</button>
    <button className="preview" style={{ width: '100%', padding: 0 }}
      aria-label={`Select page ${index + 1} from ${doc.fileName}`}
      disabled={disabled} aria-pressed={selected} onClick={e => select(page.id, e.ctrlKey || e.metaKey)}>
      <span className="num">{index + 1}</span>
      {thumb && <img src={thumb} alt="" draggable={false} style={{ transform: `rotate(${page.rotation}deg)` }} />}
      {previewFailed && <span role="status">Preview unavailable</span>}
    </button>
    <div className="meta"><strong title={doc.fileName}>{doc.fileName}</strong><span>{page.rotation ? `${page.rotation}°` : ''}</span></div>
    <div className="mini">
      <button className="btn" onClick={() => move(page.id, -1)} disabled={disabled || index === 0} aria-label={`Move page ${index + 1} left`}>←</button>
      <button className="btn" onClick={() => move(page.id, 1)} disabled={disabled || last} aria-label={`Move page ${index + 1} right`}>→</button>
    </div>
  </article>;
}
