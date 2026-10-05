import type { Rotation, WorkspacePage } from '../domain/workspace';
import type { ExportProgress, ImportedPageDescriptor } from './PdfEngine';
import type { PdfOutputSettings } from '../domain/exportOptions';

export interface PdfExportDocument {
  id: string;
  kind: 'pdf' | 'image';
  mimeType: string;
  bytes: ArrayBuffer;
  pages: ImportedPageDescriptor[];
}

export interface PdfExportPage extends Pick<WorkspacePage, 'sourceDocumentId' | 'sourcePageIndex'> {
  rotation: Rotation;
  crop?: WorkspacePage['crop'];
}

export interface PdfExportRequest {
  documents: PdfExportDocument[];
  pages: PdfExportPage[];
  output?: PdfOutputSettings;
  decorationContext?: { pageIndices: number[]; totalPages: number };
}

export type PdfExportResponse =
  | { type: 'progress'; progress: ExportProgress }
  | { type: 'result'; bytes: ArrayBuffer }
  | { type: 'error'; message: string };
