import type { WorkspacePage } from '../domain/workspace';
import type { ExportProgress, ImportedPageDescriptor } from './PdfEngine';

/** Deliberately excludes filenames, recovery metadata, original encrypted bytes and passwords. */
export interface ExportSource {
  id: string;
  kind: 'pdf' | 'image';
  mimeType: string;
  blob: Blob;
  pages: ImportedPageDescriptor[];
}
export interface ExportRequest { sources: ExportSource[]; pages: WorkspacePage[] }
export type ExportResponse =
  | ({ type: 'progress' } & ExportProgress)
  | { type: 'success'; bytes: ArrayBuffer }
  | { type: 'error' };
