import type { WorkspaceState } from '../../domain/workspace';
import { assemblePdf } from '../assemblePdf';
import type { ImportedDocument, PdfExportOptions } from '../PdfEngine';
import type { PdfExportRequest } from '../PdfExportProtocol';

// Vitest runs without the browser Worker API. Keep preparation and real
// pdf-lib assembly in these tests; only the browser transport is replaced.
export function runPdfExportInProcess(
  documents: ReadonlyMap<string, ImportedDocument>,
  workspace: WorkspaceState,
  options: PdfExportOptions = {},
) {
  if (options.signal?.aborted) return Promise.reject(new DOMException('Export cancelled', 'AbortError'));
  const sourceIds = new Set(workspace.pages.map(page => page.sourceDocumentId));
  const request: PdfExportRequest = {
    documents: [...sourceIds].map(id => {
      const source = documents.get(id);
      if (!source) throw new Error('An export source is missing');
      return {
        id: source.id,
        kind: source.kind,
        mimeType: source.mimeType,
        bytes: (source.unlockedBytes ?? source.bytes).slice(0),
        pages: source.pages.map(page => ({ ...page })),
      };
    }),
    pages: workspace.pages.map(page => ({
      sourceDocumentId: page.sourceDocumentId,
      sourcePageIndex: page.sourcePageIndex,
      rotation: page.rotation,
      ...(page.crop && { crop: { ...page.crop } }),
    })),
  };
  return assemblePdf(request, (completed, total) => {
    options.onProgress?.({ phase: 'assembling', completed, total });
  });
}
