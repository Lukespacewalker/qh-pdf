import type { Rotation, WorkspacePage } from '../domain/workspace';
import type { ImportedPageDescriptor, PdfPasswordOptions } from './PdfEngine';

export interface ExportProgress {
  phase: 'assembling' | 'protecting';
  completed: number;
  total: number;
}

export interface PdfExportOptions extends PdfPasswordOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}

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
