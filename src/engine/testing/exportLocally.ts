import { assemblePdf } from '../assemblePdf';
import { makeExportRequest } from '../PdfExportClient';
import { checkAbort } from '../abort';
import type { ExportOptions, ImportedDocument } from '../PdfEngine';
import type { WorkspaceState } from '../../domain/workspace';

/** Node tests isolate transport only. The same assembly code runs in the production worker. */
export async function exportLocally(documents: ReadonlyMap<string, ImportedDocument>, workspace: WorkspaceState, options: ExportOptions = {}): Promise<Blob> {
  checkAbort(options.signal);
  return new Blob([await assemblePdf(makeExportRequest(documents, workspace), options.onProgress)], { type: 'application/pdf' });
}
