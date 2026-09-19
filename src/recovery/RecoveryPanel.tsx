import { useEffect, useRef, useState } from 'react';
import { ImportCancelled, useWorkspaceStore, type ImportDocument } from '../workspace/useWorkspaceStore';
import { createSnapshot, restoreSnapshot } from './snapshot';
import { readSavedWork, RecoveryConflict, writeSavedWork, type SavedWork } from './repository';

export function RecoveryPanel({ importDocument, locked, onRestoring, onPending }: {
  importDocument: ImportDocument; locked: boolean; onRestoring: (value: boolean) => void; onPending: (value: boolean) => void;
}) {
  const documents = useWorkspaceStore(s => s.documents);
  const pages = useWorkspaceStore(s => s.history.present.pages);
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState<SavedWork | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('Recovery is off. Refreshing or closing this tab loses your work.');
  const [error, setError] = useState('');
  const [clearing, setClearing] = useState(false);
  const revision = useRef<string | null>(null);
  const generation = useRef(0);
  const saveSequence = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const lastSavedPages = useRef<typeof pages | null>(null);

  useEffect(() => {
    let active = true;
    readSavedWork().then(saved => {
      if (!active) return;
      revision.current = saved?.revision ?? null;
      setAvailable(saved);
      setReady(true);
      onPending(Boolean(saved));
    }).catch(() => {
      if (active) { setError('Recovery storage is unavailable in this browser. You can still work and download your PDF.'); setReady(true); onPending(false); }
    });
    return () => { active = false; };
  }, [onPending]);

  useEffect(() => {
    if (!enabled || available || lastSavedPages.current === pages) return;
    const currentGeneration = generation.current;
    const sequence = ++saveSequence.current;
    setStatus('Saving on this device…');
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (generation.current !== currentGeneration) return;
      try {
        const snapshot = createSnapshot(documents, { pages, selectedPageIds: [] });
        const saved = await writeSavedWork(snapshot, revision.current);
        revision.current = saved!.revision;
        lastSavedPages.current = pages;
        if (generation.current === currentGeneration && sequence === saveSequence.current) { setStatus('Saved on this device'); setError(''); }
      } catch (failure) {
        if (generation.current !== currentGeneration) return;
        generation.current++;
        setEnabled(false);
        setStatus('Recovery paused. Your open workspace is still available.');
        setError(failure instanceof RecoveryConflict ? failure.message :
          'We could not save your latest changes on this device. Download your PDF before closing this tab.');
      }
    });
  }, [enabled, available, documents, pages]);

  async function clear() {
    generation.current++;
    setEnabled(false);
    setClearing(true);
    setError('');
    queue.current = queue.current.catch(() => {}).then(async () => {
      try {
        await writeSavedWork(null, revision.current);
        revision.current = null;
        lastSavedPages.current = null;
        setAvailable(null);
        onPending(false);
        setStatus('Saved copy cleared. Recovery is off.');
      } catch (failure) {
        setError(failure instanceof RecoveryConflict ? failure.message :
          'We could not clear saved work. It may still be stored in this browser. Please try again.');
        setStatus('Recovery is off.');
      } finally { setClearing(false); }
    });
    await queue.current;
  }

  async function restore() {
    if (!available) return;
    onRestoring(true);
    setError('');
    try {
      const result = await restoreSnapshot(available.snapshot, importDocument);
      useWorkspaceStore.getState().restore(result.documents, result.workspace);
      lastSavedPages.current = result.workspace.pages;
      setAvailable(null);
      onPending(false);
      setEnabled(true);
      setStatus('Saved on this device');
    } catch (failure) {
      if (!(failure instanceof ImportCancelled)) setError(failure instanceof Error ? failure.message : 'Saved work could not be restored.');
    } finally { onRestoring(false); }
  }

  return <aside className={`recovery-panel ${available ? 'recovery-pending' : ''}`} aria-label="Work recovery">
    {available ? <>
      <div><strong>Saved work is waiting here.</strong><p>Restore your last saved pages, or clear the saved copy to start fresh. Password-protected files will ask for their passwords again.</p></div>
      <div className="recovery-actions">
        <button className="btn" disabled={locked || clearing} onClick={() => void restore()}>Restore saved work</button>
        <button className="btn" disabled={locked || clearing} onClick={() => void clear()}>Clear saved work</button>
      </div>
    </> : <>
      <label className="check-label"><input type="checkbox" checked={enabled} disabled={!ready || locked || clearing || (!enabled && !pages.length)}
        onChange={event => {
          if (!event.target.checked) { void clear(); return; }
          lastSavedPages.current = null;
          setError(''); setEnabled(true);
        }} />Remember work on this device</label>
      <p>Optional. Saves source files and page edits in this browser until cleared. Anyone using this browser can restore unprotected files. Protected PDFs ask for their opening password again; passwords and unlocked copies are never saved.</p>
      <div className="recovery-actions"><span role="status" data-testid="recovery-status">{enabled && pages !== lastSavedPages.current ? 'Saving on this device…' : status}</span>
        {revision.current && <button className="text-btn" disabled={locked || clearing} onClick={() => void clear()}>Clear saved work</button>}
      </div>
    </>}
    {error && <p className="notice" role="alert">{error}</p>}
  </aside>;
}
