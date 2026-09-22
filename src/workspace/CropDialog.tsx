import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isValidCrop, noCrop, type CropMargins } from '../domain/crop';
import type { WorkspacePage } from '../domain/workspace';
import type { ImportedDocument, PdfEngine } from '../engine/PdfEngine';

export function CropDialog({ page, document, count, engine, opener, onApply, onClose }: {
  page: WorkspacePage; document: ImportedDocument; count: number; engine: PdfEngine;
  opener: HTMLButtonElement; onApply: (crop: CropMargins) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const initial = page.crop ?? noCrop();
  const [margins, setMargins] = useState(Object.fromEntries(Object.entries(initial).map(([side, value]) => [side, String(value * 100)])));
  const [image, setImage] = useState('');
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const crop = Object.fromEntries(Object.entries(margins).map(([side, value]) => [side, value.trim() ? Number(value) / 100 : NaN])) as unknown as CropMargins;
  const valid = isValidCrop(crop);
  useLayoutEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    setImage(''); setFailed(false);
    void engine.renderPage(document, page.sourcePageIndex, {
      maxWidth: 680, maxHeight: 520, rotation: page.rotation, signal: controller.signal,
    }).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); setImage(url);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [document, engine, page, retry]);
  return <dialog ref={dialog} className="finishing-dialog crop-dialog" aria-labelledby="crop-title"
    onClose={() => { onClose(); requestAnimationFrame(() => { if (opener.isConnected) opener.focus(); }); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []);
      if (event.shiftKey && event.target === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && event.target === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    }}>
    <div className="finishing-heading"><h2 id="crop-title">Crop selected pages</h2>
      <button className="btn" onClick={() => dialog.current?.close()} autoFocus>Cancel</button></div>
    <p>Remove a percentage from each edge. The same crop applies to all {count} selected pages.</p>
    <div className="crop-preview" aria-label="Crop preview">
      {image ? <div className="crop-image"><img src={image} alt="First selected page before cropping" />
        {valid && <div className="crop-kept" aria-label="Area to keep" style={{
          top: `${crop.top * 100}%`, right: `${crop.right * 100}%`, bottom: `${crop.bottom * 100}%`, left: `${crop.left * 100}%`,
        }} />}</div> : failed ? <div role="alert">Preview unavailable. <button className="btn" onClick={() => setRetry(value => value + 1)}>Retry preview</button></div> : <p role="status">Rendering page…</p>}
    </div>
    <div className="finishing-fields crop-fields">{(['top', 'right', 'bottom', 'left'] as const).map(side => <label className="field" key={side}>
      {({ top: 'Top (%)', right: 'Right (%)', bottom: 'Bottom (%)', left: 'Left (%)' })[side]}
      <input type="number" min="0" max="99.9" step="0.1" value={margins[side]} onChange={event => setMargins({ ...margins, [side]: event.target.value })} />
    </label>)}</div>
    {!valid && <p className="notice" role="alert">Crop margins must leave a visible area on the page.</p>}
    <p className="sub">Cropping hides content outside the edges. It does not permanently erase it.</p>
    <div className="dialog-actions">
      <button className="btn" onClick={() => setMargins({ top: '0', right: '0', bottom: '0', left: '0' })}>Reset crop</button>
      <button className="btn primary" disabled={!valid} onClick={() => { onApply(crop); dialog.current?.close(); }}>Apply to {count} pages</button>
    </div>
  </dialog>;
}
