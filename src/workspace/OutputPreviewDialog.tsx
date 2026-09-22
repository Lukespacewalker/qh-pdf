import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { WorkspaceState } from '../domain/workspace';
import type { PdfOutputSettings } from '../domain/exportOptions';
import type { ImportedDocument, PdfEngine } from '../engine/PdfEngine';
import { useI18n } from '../i18n/i18n';

export function OutputPreviewDialog({ workspace, documents, output, engine, opener, onClose }: {
  workspace: WorkspaceState; documents: ReadonlyMap<string, ImportedDocument>; output: PdfOutputSettings;
  engine: PdfEngine; opener: HTMLButtonElement; onClose: () => void;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [retry, setRetry] = useState(0);
  const [render, setRender] = useState<{ index: number; url?: string; failed?: boolean } | null>(null);
  useLayoutEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    setRender(null);
    void engine.renderExportPage(documents, workspace, output, index, {
      maxWidth: 1000, maxHeight: 1000, signal: controller.signal,
    }).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); setRender({ index, url });
    }).catch(() => { if (!controller.signal.aborted) setRender({ index, failed: true }); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [documents, engine, index, output, retry, workspace]);
  const current = render?.index === index ? render : null;
  return <dialog ref={dialog} className="finishing-dialog output-preview-dialog" aria-labelledby="output-preview-title"
    onClose={() => { onClose(); requestAnimationFrame(() => { if (opener.isConnected) opener.focus(); }); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []);
      if (event.shiftKey && event.target === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && event.target === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    }}>
    <div className="finishing-heading"><h2 id="output-preview-title">{t('Export preview')}</h2><button className="btn" autoFocus onClick={() => dialog.current?.close()}>{t('Close')}</button></div>
    <p>{t('Check crop, page numbers and watermark. Compression is applied when saving.')}</p>
    <div className="output-preview-navigation">
      <button className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>← {t('Previous')}</button>
      <span aria-live="polite">{t('Output page {page} / {total}', { page: index + 1, total: workspace.pages.length })}</span>
      <button className="btn" disabled={index === workspace.pages.length - 1} onClick={() => setIndex(index + 1)}>{t('Next')} →</button>
    </div>
    <div className="output-preview-stage">{current?.url ? <img src={current.url} alt={t('Export preview of output page {page}', { page: index + 1 })} />
      : current?.failed ? <div role="alert"><p>{t('Could not preview this output. Check the page-number size and margins, or the watermark text and size.')}</p><button className="btn" onClick={() => setRetry(retry + 1)}>{t('Retry preview')}</button></div>
      : <p role="status">{t('Rendering export preview…')}</p>}</div>
  </dialog>;
}
