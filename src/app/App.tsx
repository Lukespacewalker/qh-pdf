import { useMemo } from 'react';
import { BrowserPdfEngine } from '../engine/BrowserPdfEngine';
import { WorkspaceScreen } from '../workspace/WorkspaceScreen';

export default function App() {
  const engine = useMemo(() => new BrowserPdfEngine(), []);

  return <div>
    <header className="topbar">
      <div className="brand">🦆 Quack & Honk PDF</div>
      <div className="sub">Runs in your browser</div>
    </header>
    <WorkspaceScreen engine={engine} />
  </div>;
}
