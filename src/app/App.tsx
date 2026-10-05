import { useMemo } from 'react';
import { BrowserPdfEngine } from '../engine/BrowserPdfEngine';
import { WorkspaceScreen } from '../workspace/WorkspaceScreen';
import { Icon } from '../components/Icon';

export default function App() {
  const engine = useMemo(() => new BrowserPdfEngine(), []);

  return <div>
    <header className="topbar">
      <div className="brand" aria-label="Quack & Honk PDF">
        <img className="brand-icon" src={`${import.meta.env.BASE_URL}app-icon.svg`} alt="" />
        <span>QH PDF</span>
        <span className="brand-byline">By Quack &amp; Honk</span>
      </div>
      <div className="header-privacy"><Icon name="lock" /><span>Runs in your browser</span></div>
    </header>
    <WorkspaceScreen engine={engine} />
  </div>;
}
