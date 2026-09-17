import { useEffect, useState } from 'react';
import type { ImportedDocument, PdfEngine } from '../engine/PdfEngine';
import type { WorkspacePage } from '../domain/workspace';
import { useWorkspaceStore } from './useWorkspaceStore';

export function PageCard({ page, index, doc, engine }: {
  page: WorkspacePage; index: number; doc: ImportedDocument; engine: PdfEngine;
}) {
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

  return <article className={`card ${selected ? 'selected' : ''}`} aria-label={`Page ${index + 1} from ${doc.fileName}`}>
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
