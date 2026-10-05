import { createPdfToolkit } from 'pdfstudio';
import wasmUrl from 'pdfstudio/qpdf.wasm?url';
import { AppError } from '../errors/AppError';
import type { CompressionLevel } from './PdfCompression';

const compressionFailure = () => new AppError(
  'export-failed',
  'PDF compression failed. Your workspace is still here.',
);

let toolkit: ReturnType<typeof createPdfToolkit> | undefined;

function getToolkit() {
  toolkit ??= createPdfToolkit({ wasmUrl }).catch(() => {
    toolkit = undefined;
    throw compressionFailure();
  });
  return toolkit;
}

const structuralOptions = [
  '--compress-streams=y',
  '--recompress-flate',
  '--compression-level=9',
  '--object-streams=generate',
] as const;

const imageOptions: Record<Exclude<CompressionLevel, 'lossless'>, readonly string[]> = {
  balanced: [
    '--optimize-images',
    '--jpeg-quality=75',
    '--oi-min-width=0',
    '--oi-min-height=0',
    '--oi-min-area=0',
  ],
  small: [
    '--optimize-images',
    '--jpeg-quality=45',
    '--oi-min-width=0',
    '--oi-min-height=0',
    '--oi-min-area=0',
  ],
};

export async function compressPdfInProcess(
  bytes: Uint8Array,
  level: CompressionLevel,
): Promise<Uint8Array<ArrayBuffer>> {
  const source = Uint8Array.from(bytes);
  try {
    const pdf = await getToolkit();
    const optimized = level === 'lossless'
      ? await pdf.compress(source, { compressionLevel: 9, objectStreams: true })
      : await pdf.raw(
        [source],
        [...structuralOptions, ...imageOptions[level], '$in0', '$out'],
      );
    return optimized.length < source.length ? Uint8Array.from(optimized) : source;
  } catch {
    throw compressionFailure();
  }
}
