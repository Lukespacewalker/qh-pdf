import { MascotState } from '../brand/MascotState';
import type { ExportProgress } from '../engine/PdfEngine';

export function ExportPanel({
  exporting,
  progress,
  done,
  cancelled,
  onCancel,
}: {
  exporting: boolean;
  progress: ExportProgress;
  done: boolean;
  cancelled: boolean;
  onCancel: () => void;
}) {
  if (exporting) {
    const max = Math.max(progress.total, 1);
    return <div className="status" role="status" aria-live="polite">
      <MascotState state="working" alt="Quack working" />
      <div className="status-content">
        <strong>Creating your PDF…</strong>
        <div className="sub">
          {progress.total > 0 ? `${progress.completed} of ${progress.total} pages` : 'Preparing pages…'}
        </div>
        <progress className="export-progress" max={max} value={Math.min(progress.completed, max)} />
      </div>
      <button className="btn" type="button" onClick={onCancel}>Cancel</button>
    </div>;
  }

  if (done) return <div className="status" role="status" aria-live="polite">
    <MascotState state="success" alt="Honk happy" />
    <div><strong>Your PDF is ready.</strong><div className="sub">Created without uploading your document.</div></div>
  </div>;

  if (cancelled) return <div className="status" role="status" aria-live="polite">
    <div><strong>Export cancelled.</strong><div className="sub">Your workspace is unchanged.</div></div>
  </div>;

  return null;
}
