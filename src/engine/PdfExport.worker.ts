import { assemblePdf } from './assemblePdf';
import type { ExportRequest, ExportResponse } from './exportProtocol';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ExportRequest>) => void) | null;
  postMessage(message: ExportResponse, transfer?: Transferable[]): void;
};
let started = false;
scope.onmessage = async ({ data }) => {
  if (started) return;
  started = true;
  try {
    const bytes = await assemblePdf(data, value => scope.postMessage({ type: 'progress', ...value }));
    scope.postMessage({ type: 'success', bytes }, [bytes]);
  } catch { scope.postMessage({ type: 'error' }); }
};
