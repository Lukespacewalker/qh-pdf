import { useMemo } from 'react';
import { BrowserPdfEngine } from '../engine/BrowserPdfEngine';
import { I18nProvider, useI18n } from '../i18n/i18n';
import '../i18n/i18n.css';
import { WorkspaceScreen } from '../workspace/WorkspaceScreen';

function AppContent() {
  const engine = useMemo(() => new BrowserPdfEngine(), []);
  const { language, setLanguage, t } = useI18n();

  return <div>
    <header className="topbar">
      <div className="brand" aria-label="Quack & Honk PDF">
        QH <span>PDF</span><span className="brand-dot" aria-hidden="true" />
      </div>
      <span className="header-subtitle">{t('Merge & organize')}</span>
      <nav className="topbar-meta" aria-label={t('Tools and language')}>
        <div className="language-switch" role="group" aria-label={t('Language')}>
          <button lang="en" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
          <span aria-hidden="true">/</span>
          <button lang="th" aria-pressed={language === 'th'} onClick={() => setLanguage('th')}>ไทย</button>
        </div>
        <a className="sibling-link" href="https://image.quackandhonk.com" target="_blank" rel="noopener noreferrer"
          aria-label={t('QH Image (opens in a new tab)')}>QH Image <span aria-hidden="true">↗</span></a>
      </nav>
    </header>
    <WorkspaceScreen engine={engine} />
  </div>;
}

export default function App() {
  return <I18nProvider><AppContent /></I18nProvider>;
}
