// Only these application-owned messages may cross the worker boundary. Library
// diagnostics can contain private document data and must remain undisclosed.
export const outputErrors = new Set([
  'Page number does not fit inside the visible page area.',
  'Watermark geometry exceeds the supported page range.',
  'Could not load the bundled decoration font',
  'The watermark contains a character that the bundled font cannot display.',
]);
export const genericExportError = 'We couldn’t create the PDF. Your workspace is still here.';
export function safeExportMessage(error: unknown): string {
  if (!(error instanceof Error)) return genericExportError;
  if (outputErrors.has(error.message)) return error.message;
  if (/^Unsupported text character U\+[0-9A-F]+$/.test(error.message)) {
    return 'The watermark contains a character that the bundled font cannot display.';
  }
  return genericExportError;
}
