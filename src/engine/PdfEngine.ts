import type { WorkspaceState } from '../domain/workspace';

export interface ImportedPageDescriptor {
  sourcePageIndex: number;
  width: number;
  height: number;
}

export interface ImportedDocument {
  id: string;
  fileName: string;
  mimeType: string;
  kind: 'pdf' | 'image';
  bytes: ArrayBuffer;
  pages: ImportedPageDescriptor[];
}

export interface ExportProgress {
  completed: number;
  total: number;
}

export interface ExportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}

export interface PdfEngine {
  importFile(file: File): Promise<ImportedDocument>;
  renderThumbnail(doc: ImportedDocument, pageIndex: number, maxWidth: number): Promise<Blob>;
  exportWorkspace(
    documents: ReadonlyMap<string, ImportedDocument>,
    workspace: WorkspaceState,
    options?: ExportOptions,
  ): Promise<Blob>;
}
