import type { Rotation, WorkspacePage } from '../domain/workspace';
import type { ExportProgress, ImportedPageDescriptor } from './PdfEngine';

export interface PdfExportDocument {
  id: string;
  kind: 'pdf' | 'image';
  mimeType: string;
  bytes: ArrayBuffer;
  pages: ImportedPageDescriptor[];
}

export interface PdfExportPage extends Pick<WorkspacePage, 'sourceDocumentId' | 'sourcePageIndex'> {
  rotation: Rotation;
}

export interface PdfExportRequest {
  documents: PdfExportDocument[];
  pages: PdfExportPage[];
}

export type PdfExportResponse =
  | { type: 'progress'; progress: ExportProgress }
  | { type: 'result'; bytes: ArrayBuffer }
  | { type: 'error'; message: string };
