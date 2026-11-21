import { useEffect, useMemo } from 'react';
import { SiteFooter } from '../brand/SiteFooter';
import { BrowserPdfEngine } from '../engine/BrowserPdfEngine';
import { I18nProvider, useI18n } from '../i18n/i18n';
import '../i18n/i18n.css';
import { WorkspaceScreen } from '../workspace/WorkspaceScreen';

function AppContent() {
  const engine = useMemo(() => new BrowserPdfEngine(), []);
  const { language, setLanguage, t } = useI18n();
  useEffect(() => {
    document.title = t('Quack & Honk PDF · Merge, organize and compress PDFs');
  }, [t]);

  return <>
    <header className="topbar site-width">
      <div className="wordmark" translate="no">
        <img src={`${import.meta.env.BASE_URL}app-icon.svg`} width={44} height={44} alt="" />
        <div className="wordmark-text">
          <span className="wordmark-name">Quack{' '}<span>&amp;</span>{' '}Honk</span>
          <span className="wordmark-product">PDF</span>
        </div>
      </div>
      <div className="topbar-meta language-switch" role="group" aria-label={t('Language')}>
        <button lang="en" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
        <span aria-hidden="true">/</span>
        <button lang="th" aria-pressed={language === 'th'} onClick={() => setLanguage('th')}>ไทย</button>
      </div>
    </header>
    <WorkspaceScreen engine={engine} />
    <SiteFooter />
  </>;
}

export default function App() {
  return <I18nProvider><AppContent /></I18nProvider>;
}
