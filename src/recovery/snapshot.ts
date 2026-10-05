import type { WorkspaceState } from '../domain/workspace';
import { assertCrop, isValidCrop } from '../domain/crop';
import type { ImportedDocument } from '../engine/PdfEngine';
import type { ImportDocument } from '../workspace/useWorkspaceStore';

interface SavedSource { id: string; fileName: string; mimeType: string; bytes: ArrayBuffer }
export interface Snapshot {
  version: 1;
  documents: SavedSource[];
  workspace: WorkspaceState;
}

export function createSnapshot(documents: ReadonlyMap<string, ImportedDocument>, workspace: WorkspaceState): Snapshot {
  const ids = new Set(workspace.pages.map(page => page.sourceDocumentId));
  return {
    version: 1,
    documents: [...ids].map(id => {
      const doc = documents.get(id);
      if (!doc) throw new Error('A source document is missing.');
      // Whitelist fields: original bytes only, never decrypted bytes or passwords.
      return { id, fileName: doc.fileName, mimeType: doc.mimeType, bytes: doc.bytes };
    }),
    workspace: {
      pages: workspace.pages.map(page => {
        if (page.crop !== undefined) assertCrop(page.crop);
        return { ...page, ...(page.crop && { crop: { ...page.crop } }) };
      }),
      selectedPageIds: [...workspace.selectedPageIds],
    },
  };
}

export async function restoreSnapshot(value: unknown, importDocument: ImportDocument) {
  const saved = value as Snapshot | null;
  const invalid = () => new Error('This saved work could not be restored. You can clear it and import the original files.');
  if (!saved || saved.version !== 1 || !Array.isArray(saved.documents) || !Array.isArray(saved.workspace?.pages) ||
      !Array.isArray(saved.workspace.selectedPageIds)) throw invalid();
  const documents = new Map<string, ImportedDocument>();
  for (const source of saved.documents) {
    if (!source || typeof source.id !== 'string' || typeof source.fileName !== 'string' ||
        typeof source.mimeType !== 'string' || !(source.bytes instanceof ArrayBuffer) || documents.has(source.id)) throw invalid();
    const doc = await importDocument(new File([source.bytes], source.fileName, { type: source.mimeType }));
    documents.set(source.id, { ...doc, id: source.id });
  }
  const ids = new Set<string>();
  for (const page of saved.workspace.pages) {
    const doc = page && documents.get(page.sourceDocumentId);
    if (!page || typeof page.id !== 'string' || ids.has(page.id) || !doc || !Number.isInteger(page.sourcePageIndex) ||
        page.sourcePageIndex < 0 || page.sourcePageIndex >= doc.pages.length || ![0, 90, 180, 270].includes(page.rotation) ||
        (page.crop !== undefined && !isValidCrop(page.crop))) throw invalid();
    ids.add(page.id);
  }
  return { documents, workspace: {
    pages: saved.workspace.pages.map(page => ({ ...page, ...(page.crop && { crop: { ...page.crop } }) })),
    selectedPageIds: saved.workspace.selectedPageIds.filter(id => ids.has(id)),
  } };
}
