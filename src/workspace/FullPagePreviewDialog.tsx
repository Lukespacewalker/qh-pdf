import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WorkspacePage } from '../domain/workspace';
import type { ImportedDocument, PdfEngine } from '../engine/PdfEngine';

type RenderState =
  | { key: string; status: 'loading' }
  | { key: string; status: 'ready'; url: string }
  | { key: string; status: 'error' };

export function FullPagePreviewDialog({
  pageId, pages, documents, engine, opener, onNavigate, onRotate, onClose,
}: {
  pageId: string;
  pages: WorkspacePage[];
  documents: ReadonlyMap<string, ImportedDocument>;
  engine: PdfEngine;
  opener: HTMLButtonElement | null;
  onNavigate: (pageId: string) => void;
  onRotate: (pageId: string, degrees: 90 | -90) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(100);
  const [retry, setRetry] = useState(0);
  const [render, setRender] = useState<RenderState | null>(null);
  const pageIndex = pages.findIndex(page => page.id === pageId);
  const page = pages[pageIndex];
  const document = page ? documents.get(page.sourceDocumentId) : undefined;
  const renderKey = page && document && viewport.width > 0 && viewport.height > 0
    ? `${page.id}:${page.rotation}:${zoom}:${viewport.width}:${viewport.height}:${retry}`
    : '';

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const update = () => {
      const style = getComputedStyle(node);
      const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const next = {
        width: Math.max(1, Math.floor(node.clientWidth - horizontalPadding)),
        height: Math.max(1, Math.floor(node.clientHeight - verticalPadding)),
      };
      setViewport(current => current.width === next.width && current.height === next.height ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setZoom(100);
    viewportRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pageId]);

  useEffect(() => {
    if (!page || !document || !renderKey) return;
    const controller = new AbortController();
    let objectUrl = '';
    setRender({ key: renderKey, status: 'loading' });
    void engine.renderPage(document, page.sourcePageIndex, {
      maxWidth: viewport.width * zoom / 100,
      maxHeight: viewport.height * zoom / 100,
      rotation: page.rotation,
      signal: controller.signal,
    }).then(blob => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setRender({ key: renderKey, status: 'ready', url: objectUrl });
    }).catch(error => {
      if (!controller.signal.aborted && (!(error instanceof DOMException) || error.name !== 'AbortError')) {
        setRender({ key: renderKey, status: 'error' });
      }
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document, engine, page, renderKey, viewport.height, viewport.width, zoom]);

  const visibleRender = render?.key === renderKey ? render : null;
  const previous = pageIndex > 0 ? pages[pageIndex - 1] : undefined;
  const next = pageIndex >= 0 && pageIndex < pages.length - 1 ? pages[pageIndex + 1] : undefined;
  const imageLabel = document && pageIndex >= 0 ? `Preview of page ${pageIndex + 1} from ${document.fileName}` : 'Page preview';
  const close = () => dialogRef.current?.close();
  const restoreFocus = () => {
    onClose();
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
  };
  const changeZoom = (nextZoom: number) => setZoom(Math.max(50, Math.min(200, nextZoom)));
  const navigation = useMemo(() => ({ previous, next }), [next, previous]);

  return <dialog ref={dialogRef} className="full-page-preview-dialog" aria-labelledby="page-preview-title"
    onClose={restoreFocus} onKeyDown={event => {
      if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        const focusable = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )) : [];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && dialog?.ownerDocument.activeElement === first && last) {
          event.preventDefault();
          last.focus();
          return;
        }
        if (!event.shiftKey && dialog?.ownerDocument.activeElement === last && first) {
          event.preventDefault();
          first.focus();
          return;
        }
      }
      const previewViewport = viewportRef.current;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          (event.target === previewViewport && previewViewport.scrollWidth > previewViewport.clientWidth) ||
          (event.target as HTMLElement).matches('input, textarea, select')) return;
      if (event.key === 'ArrowLeft' && navigation.previous) {
        event.preventDefault();
        onNavigate(navigation.previous.id);
      } else if (event.key === 'ArrowRight' && navigation.next) {
        event.preventDefault();
        onNavigate(navigation.next.id);
      }
    }}>
    <header className="full-page-preview-header">
      <div>
        <h2 id="page-preview-title">Page preview</h2>
        <p aria-live="polite">{pageIndex >= 0 ? `Page ${pageIndex + 1} / ${pages.length}` : 'Page unavailable'}</p>
      </div>
      <button className="btn" type="button" aria-label="Close preview" onClick={close} autoFocus>Close</button>
    </header>
    <div className="full-page-preview-controls" aria-label="Preview controls">
      <div className="preview-control-group" role="group" aria-label="Page navigation">
        <button className="btn" type="button" aria-label="Previous page" disabled={!previous} onClick={() => previous && onNavigate(previous.id)}>← Previous</button>
        <button className="btn" type="button" aria-label="Next page" disabled={!next} onClick={() => next && onNavigate(next.id)}>Next →</button>
      </div>
      <div className="preview-control-group" role="group" aria-label="Preview zoom">
        <button className="btn" type="button" aria-label="Zoom out" disabled={zoom === 50} onClick={() => changeZoom(zoom - 25)}>−</button>
        <output aria-label="Preview zoom level">{zoom}%</output>
        <button className="btn" type="button" aria-label="Zoom in" disabled={zoom === 200} onClick={() => changeZoom(zoom + 25)}>+</button>
        <button className="btn" type="button" aria-label="Fit page" onClick={() => { setZoom(100); viewportRef.current?.scrollTo({ top: 0, left: 0 }); }}>Fit page</button>
      </div>
      <div className="preview-control-group" role="group" aria-label="Rotate previewed page">
        <button className="btn" type="button" aria-label="Rotate previewed page left" disabled={!page} onClick={() => page && onRotate(page.id, -90)}>↶ Rotate</button>
        <button className="btn" type="button" aria-label="Rotate previewed page right" disabled={!page} onClick={() => page && onRotate(page.id, 90)}>Rotate ↷</button>
      </div>
    </div>
    <div ref={viewportRef} className="full-page-preview-viewport" tabIndex={0} aria-label="Scrollable page preview">
      <div className="full-page-preview-stage">
        {!page || !document ? <div className="preview-message" role="alert">This page’s source is unavailable. Close the preview and restore the document.</div> :
          visibleRender?.status === 'error' ? <div className="preview-message" role="alert">
            <strong>We couldn’t render this page.</strong>
            <button className="btn" type="button" onClick={() => setRetry(value => value + 1)}>Retry preview</button>
          </div> : visibleRender?.status === 'ready' ?
            <img className="full-page-preview-image" src={visibleRender.url} alt={imageLabel} draggable={false} /> :
            <div className="preview-message" role="status">Rendering page…</div>}
      </div>
    </div>
  </dialog>;
}
