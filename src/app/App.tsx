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
      <div className="brand">
        <img className="brand-icon" src={`${import.meta.env.BASE_URL}app-icon.svg`} alt="" />
        <span>Quack & Honk PDF</span>
      </div>
      <div className="topbar-meta">
        <div className="sub">{t('Runs in your browser')}</div>
        <label className="language-picker">
          <span>{t('Language')}</span>
          <select value={language} onChange={event => setLanguage(event.target.value as 'en' | 'th')}>
            <option value="en">English</option>
            <option value="th">ไทย</option>
          </select>
        </label>
      </div>
    </header>
    <WorkspaceScreen engine={engine} />
  </div>;
}

export default function App() {
  return <I18nProvider><AppContent /></I18nProvider>;
}
