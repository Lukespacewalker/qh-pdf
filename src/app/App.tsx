import { useMemo } from 'react';
import { BrowserPdfEngine } from '../engine/BrowserPdfEngine';
import { WorkspaceScreen } from '../workspace/WorkspaceScreen';

export default function App() {
  const engine = useMemo(() => new BrowserPdfEngine(), []);

  return <div>
    <header className="topbar">
      <a
        className="brand brand-link"
        href="https://quackandhonk.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Visit Quack & Honk (opens in a new tab)"
      >
        <span aria-hidden="true">🦆 Quack & Honk PDF</span>
        <span className="external-mark" aria-hidden="true">↗</span>
      </a>
      <div className="sub">Runs in your browser</div>
    </header>
    <WorkspaceScreen engine={engine} />
  </div>;
}
