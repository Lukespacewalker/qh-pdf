import { lockPdf, unlockPdf } from './QpdfAdapter';
import { AppError } from '../errors/AppError';
import type { SecurityRequest, SecurityResponse } from './PdfSecurity';

// No document names are sent here. The adapter's generic AppErrors are the only
// diagnostics allowed out of the worker; raw QPDF errors can contain metadata.
self.onmessage = async ({ data }: MessageEvent<SecurityRequest>) => {
  let response: SecurityResponse;
  try {
    const bytes = data.operation === 'lock'
      ? (await lockPdf(new Uint8Array(data.bytes), data.password)).buffer
      : await unlockPdf(data.bytes, data.password);
    response = { ok: true, bytes };
    self.postMessage(response, { transfer: [bytes] });
  } catch (error) {
    response = error instanceof AppError
      ? { ok: false, code: error.code, message: error.message }
      : {
        ok: false, code: data.operation === 'lock' ? 'export-failed' : 'import-failed',
        message: 'The PDF password operation failed. Your workspace is still here.',
      };
    self.postMessage(response);
  }
};
