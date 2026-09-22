export function createPdfJsLoader<Runtime>(importRuntime: () => Promise<Runtime>) {
  let pending: Promise<Runtime> | undefined;
  return () => {
    if (!pending) {
      const retryable = importRuntime().catch(error => {
        if (pending === retryable) pending = undefined;
        throw error;
      });
      pending = retryable;
    }
    return pending;
  };
}

export const loadPdfJsRuntime = createPdfJsLoader(() => import('./PdfJsRuntime'));
