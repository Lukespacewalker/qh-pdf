import type { ReactNode } from 'react';
import { MascotState } from '../brand/MascotState';
import { Icon } from '../components/Icon';
import { useI18n } from '../i18n/i18n';

export function WelcomePanel({ busy, locked, drag, onChoose, onDragChange, onDrop, error, history }: {
  busy: boolean; locked: boolean; drag: boolean; onChoose: () => void;
  onDragChange: (value: boolean) => void; onDrop: (files: File[]) => void;
  error: ReactNode; history: ReactNode;
}) {
  const { t } = useI18n();
  return <section className="welcome-hero" aria-labelledby="welcome-title">
    <div className={`drop ${drag ? 'drag' : ''}`}
      onDragOver={event => { event.preventDefault(); if (!locked) onDragChange(true); }}
      onDragLeave={() => onDragChange(false)}
      onDrop={event => { event.preventDefault(); onDragChange(false); onDrop(Array.from(event.dataTransfer.files)); }}>
      <MascotState state={busy ? 'working' : 'empty'} alt={busy ? t('Quack working') : t('Quack and Honk arranging PDF pages together')} />
      <h1 id="welcome-title">{t('Drop PDFs or images here')}</h1>
      <p className="drop-intro">{t('or choose them from your device')}</p>
      {error}
      <button className="btn primary file-btn" aria-describedby="supported-formats" onClick={onChoose} disabled={locked}>
        <Icon name="file" />{busy ? t('Preparing pages…') : t('Choose files')}
      </button>
      <p className="formats" id="supported-formats">PDF · JPG / JPEG · PNG · WebP</p>
      {history && <div className="welcome-history" aria-label={t('Document history')}>{history}</div>}
    </div>
  </section>;
}
