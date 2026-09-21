import type { WorkspaceState } from '../domain/workspace';

export interface ImportedPageDescriptor { sourcePageIndex: number; width: number; height: number }
export interface ImportedDocument {
  id: string;
  fileName: string;
  mimeType: string;
  kind: 'pdf' | 'image';
  /** Original source bytes, including encryption. Safe to use for opt-in recovery. */
  bytes: ArrayBuffer;
  /** Session-only working copy. Never persist this or the supplied password. */
  unlockedBytes?: ArrayBuffer;
  encrypted?: boolean;
  pages: ImportedPageDescriptor[];
}
export interface PdfPasswordOptions { password?: string }
export interface PageRenderOptions {
  maxWidth: number;
  maxHeight: number;
  rotation: 0 | 90 | 180 | 270;
  signal?: AbortSignal;
}
export interface ExportProgress {
  phase: 'assembling' | 'protecting';
  completed: number;
  total: number;
}
export interface PdfExportOptions extends PdfPasswordOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}
export interface PdfEngine {
  importFile(file: File, options?: PdfPasswordOptions): Promise<ImportedDocument>;
  renderThumbnail(doc: ImportedDocument, pageIndex: number, maxWidth: number): Promise<Blob>;
  renderPage(doc: ImportedDocument, pageIndex: number, options: PageRenderOptions): Promise<Blob>;
  exportWorkspace(documents: ReadonlyMap<string, ImportedDocument>, workspace: WorkspaceState, options?: PdfExportOptions): Promise<Blob>;
}
