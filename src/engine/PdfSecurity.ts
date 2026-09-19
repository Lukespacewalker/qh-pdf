import { createPdfToolkit, PdfPasswordError } from 'pdfstudio';
import wasmUrl from 'pdfstudio/qpdf.wasm?url';
import { AppError } from '../errors/AppError';

// This entire module is lazy-loaded. Vite emits both JS and WASM as local assets.
// Only the compiled module is cached: pdfstudio creates a fresh in-memory
// filesystem per operation, using numbered paths rather than document names.
let toolkit: ReturnType<typeof createPdfToolkit> | undefined;
function getToolkit() {
  toolkit ??= createPdfToolkit({ wasmUrl }).catch(() => {
    toolkit = undefined;
    throw new AppError('import-failed', 'The PDF password tool could not start. Please try again.');
  });
  return toolkit;
}

export async function unlockPdf(bytes: ArrayBuffer, password = ''): Promise<ArrayBuffer> {
  // Emscripten passes NUL-terminated strings. Never silently use a password prefix.
  if (password.includes('\0')) {
    throw new AppError('password-protected', 'This PDF needs a valid password. Please try again.');
  }
  try {
    return Uint8Array.from(await (await getToolkit()).unlock(bytes, { password })).buffer;
  } catch (error) {
    if (error instanceof PdfPasswordError) {
      throw new AppError('password-protected', 'This PDF needs a valid password. Please try again.');
    }
    if (error instanceof AppError) throw error;
    // QPDF diagnostics may contain document metadata. Keep them out of UI/logs.
    throw new AppError('invalid-pdf', 'We couldn’t unlock this PDF.');
  }
}

export async function lockPdf(bytes: Uint8Array, password: string): Promise<Uint8Array<ArrayBuffer>> {
  // PDF AES-256 uses at most 127 UTF-8 bytes. Reject truncation and empty passwords
  // so choosing protection cannot accidentally create a file that opens freely.
  const length = new TextEncoder().encode(password).length;
  if (length === 0 || length > 127 || password.includes('\0')) {
    throw new AppError('export-failed', 'Use a password of 1–127 UTF-8 bytes without a null character.');
  }
  return Uint8Array.from(await (await getToolkit()).lock(bytes, {
    userPassword: password, ownerPassword: password, keyLength: 256,
  }));
}
