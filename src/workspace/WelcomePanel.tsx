import type { ReactNode } from 'react';
import { MascotState } from '../brand/MascotState';
import { Icon } from '../components/Icon';

export function WelcomePanel({ busy, locked, drag, onChoose, onDragChange, onDrop, error, history }: {
  busy: boolean; locked: boolean; drag: boolean; onChoose: () => void;
  onDragChange: (value: boolean) => void; onDrop: (files: File[]) => void;
  error: ReactNode; history: ReactNode;
}) {
  return <section className="welcome-hero" aria-labelledby="welcome-title">
    <div className="welcome-copy">
      <p className="eyebrow">Your document workspace</p>
      <h1 id="welcome-title">Bring your pages <span>together.</span></h1>
      <p className="welcome-intro">Combine PDFs and pictures. Arrange your pages. Save one document.</p>
      <div className="welcome-reassurance">
        <p><Icon name="lock" />Your documents stay on this device.</p>
        <p>Free to use. No account needed.</p>
      </div>
    </div>
    <div className={`drop ${drag ? 'drag' : ''}`}
      onDragOver={event => { event.preventDefault(); if (!locked) onDragChange(true); }}
      onDragLeave={() => onDragChange(false)}
      onDrop={event => { event.preventDefault(); onDragChange(false); onDrop(Array.from(event.dataTransfer.files)); }}>
      <MascotState state={busy ? 'working' : 'empty'} alt={busy ? 'Quack working' : 'Quack welcoming you to the workspace'} />
      <h2>Drop your files here</h2>
      <p className="drop-intro">or choose them from your device</p>
      {error}
      <button className="btn primary file-btn" aria-describedby="supported-formats" onClick={onChoose} disabled={locked}>
        <Icon name="file" />{busy ? 'Preparing pages…' : 'Choose files'}
      </button>
      <p className="formats" id="supported-formats">PDF · JPG / JPEG · PNG · WebP</p>
      {history && <div className="welcome-history" aria-label="Document history">{history}</div>}
    </div>
  </section>;
}
