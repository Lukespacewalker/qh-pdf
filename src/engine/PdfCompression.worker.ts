import { compressPdfInProcess } from './compressionAdapter';
import type { CompressionRequest, CompressionResponse } from './PdfCompression';

self.onmessage = async ({ data }: MessageEvent<CompressionRequest>) => {
  let response: CompressionResponse;
  try {
    const bytes = (await compressPdfInProcess(new Uint8Array(data.bytes), data.level)).buffer;
    response = { ok: true, bytes };
    self.postMessage(response, { transfer: [bytes] });
  } catch {
    response = { ok: false };
    self.postMessage(response);
  }
};
