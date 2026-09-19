import { useState } from 'react';

export function SavePanel({ count, locked, exporting, onSave }: {
  count: number; locked: boolean; exporting: boolean; onSave: (password?: string) => Promise<boolean>;
}) {
  const [protect, setProtect] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  async function submit() {
    setError('');
    if (protect && (!password || password.includes('\0') || new TextEncoder().encode(password).length > 127)) {
      setError('Enter a password up to 127 UTF-8 bytes (roughly 127 English characters).'); return;
    }
    if (protect && password !== confirm) { setError('The passwords do not match.'); return; }
    if (await onSave(protect ? password : undefined)) { setPassword(''); setConfirm(''); }
  }
  return <section className="save-panel" aria-labelledby="save-title">
    <div className="save-summary"><div><h2 id="save-title">Ready to save?</h2>
      <p>Download all {count} {count === 1 ? 'page' : 'pages'} in the order shown.</p></div>
      <button className="btn primary" disabled={locked} onClick={() => void submit()}>{exporting ? 'Creating PDF…' : 'Save PDF'}</button>
    </div>
    <label className="check-label"><input type="checkbox" checked={protect} disabled={locked}
      onChange={event => { setProtect(event.target.checked); setPassword(''); setConfirm(''); setError(''); }} />Require a password to open the saved PDF</label>
    {protect ? <div className="password-fields">
      <label className="field">New PDF password<input type="password" value={password} autoComplete="new-password" disabled={locked} onChange={event => setPassword(event.target.value)} /></label>
      <label className="field">Confirm password<input type="password" value={confirm} autoComplete="new-password" disabled={locked} onChange={event => setConfirm(event.target.value)} /></label>
      <p>Keep this password somewhere safe. We cannot recover it. It is never saved with your workspace.</p>
    </div> : <p className="save-note">The downloaded PDF will have no password, even if an original file had one.</p>}
    {error && <p className="notice" role="alert">{error}</p>}
  </section>;
}
