import { assemblePdf } from './assemblePdf';
import type { PdfExportRequest, PdfExportResponse } from './PdfExportProtocol';

self.onmessage = async ({ data }: MessageEvent<PdfExportRequest>) => {
  try {
    const bytes = await assemblePdf(data, (completed, total) => {
      const response: PdfExportResponse = {
        type: 'progress',
        progress: { phase: 'assembling', completed, total },
      };
      self.postMessage(response);
    });
    const response: PdfExportResponse = { type: 'result', bytes };
    self.postMessage(response, { transfer: [bytes] });
  } catch {
    const response: PdfExportResponse = {
      type: 'error',
      message: 'We couldn’t create the PDF. Your workspace is still here.',
    };
    self.postMessage(response);
  }
};
