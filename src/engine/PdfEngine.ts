import type { Rotation, WorkspaceState } from '../domain/workspace';

export interface ImportedPageDescriptor { sourcePageIndex: number; width: number; height: number }
export interface ImportedDocument {
  id: string;
  fileName: string;
  mimeType: string;
  kind: 'pdf' | 'image';
  /** Original source bytes, including encryption. Safe for opt-in recovery. */
  bytes: ArrayBuffer;
  /** Session-only working copy. Never persist this or a supplied password. */
  unlockedBytes?: ArrayBuffer;
  encrypted?: boolean;
  pages: ImportedPageDescriptor[];
}
export interface PdfPasswordOptions { password?: string }
export interface ExportProgress {
  phase: 'assembling' | 'writing' | 'encrypting';
  completed: number;
  total: number;
}
export interface ExportOptions extends PdfPasswordOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}
export interface RenderOptions {
  signal?: AbortSignal;
  rotation?: Rotation;
  /** Lower values prioritize a focused preview over thumbnail requests. */
  priority?: number;
}
export interface PdfEngine {
  importFile(file: File, options?: PdfPasswordOptions): Promise<ImportedDocument>;
  renderThumbnail(doc: ImportedDocument, pageIndex: number, maxEdge: number, options?: RenderOptions): Promise<Blob>;
  exportWorkspace(documents: ReadonlyMap<string, ImportedDocument>, workspace: WorkspaceState, options?: ExportOptions): Promise<Blob>;
  dispose?(): void;
}
