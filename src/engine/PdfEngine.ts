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
export interface PdfEngine {
  importFile(file: File, options?: PdfPasswordOptions): Promise<ImportedDocument>;
  renderThumbnail(doc: ImportedDocument, pageIndex: number, maxWidth: number): Promise<Blob>;
  exportWorkspace(documents: ReadonlyMap<string, ImportedDocument>, workspace: WorkspaceState, options?: PdfPasswordOptions): Promise<Blob>;
}
