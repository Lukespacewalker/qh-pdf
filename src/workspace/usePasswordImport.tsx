import { useEffect, useRef, useState } from 'react';
import type { PdfEngine } from '../engine/PdfEngine';
import { AppError } from '../errors/AppError';
import { useI18n } from '../i18n/i18n';
import { ImportCancelled } from './useWorkspaceStore';

export function usePasswordImport(engine: PdfEngine) {
  const { t } = useI18n();
  const [request, setRequest] = useState<{ fileName: string; retry: boolean } | null>(null);
  const [password, setPassword] = useState('');
  const resolve = useRef<((value: string | null) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (request) { dialog.current?.showModal(); passwordInput.current?.focus(); }
    else dialog.current?.close();
  }, [request]);
  useEffect(() => () => { resolve.current?.(null); }, []);

  function finish(value: string | null) {
    resolve.current?.(value);
    resolve.current = null;
    setPassword('');
    setRequest(null);
  }
  async function importDocument(file: File) {
    let supplied: string | undefined;
    while (true) {
      try { return await engine.importFile(file, supplied === undefined ? undefined : { password: supplied }); }
      catch (error) {
        if (!(error instanceof AppError) || error.code !== 'password-protected') throw error;
        const next = await new Promise<string | null>(done => {
          resolve.current = done;
          setPassword('');
          setRequest({ fileName: file.name, retry: supplied !== undefined });
        });
        if (next === null) throw new ImportCancelled();
        supplied = next;
      }
    }
  }
  const passwordDialog = <dialog ref={dialog} className="password-dialog" aria-labelledby="unlock-title"
    onCancel={event => { event.preventDefault(); finish(null); }}>
    <form onSubmit={event => { event.preventDefault(); finish(password); }}>
      <h2 id="unlock-title">{t('Open a protected PDF')}</h2>
      <p className="file-name">{request?.fileName}</p>
      <p>{t('Your password is used only in this browser and is never saved.')}</p>
      {request?.retry && <p className="notice" role="alert">{t('That password didn’t open this PDF. Please try again.')}</p>}
      <label className="field">{t('PDF password')}<input ref={passwordInput} type="password" value={password}
        autoComplete="off" onChange={event => setPassword(event.target.value)} /></label>
      <div className="dialog-actions"><button type="button" className="btn" onClick={() => finish(null)}>{t('Cancel import')}</button>
        <button className="btn primary" type="submit">{t('Unlock PDF')}</button></div>
    </form>
  </dialog>;
  return { importDocument, passwordDialog };
}
