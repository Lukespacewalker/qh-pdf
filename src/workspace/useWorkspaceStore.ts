import { create } from 'zustand';
import {
  appendPages, deletePages, duplicatePages, emptyWorkspace, movePage, reorderPage,
  rotatePages, toggleSelection, type WorkspaceState,
} from '../domain/workspace';
import { commit, createHistory, redo, undo, type HistoryState } from '../domain/workspaceCommands';
import type { ImportedDocument } from '../engine/PdfEngine';
import { newId } from '../lib/ids';

export type ImportDocument = (file: File) => Promise<ImportedDocument>;
export class ImportCancelled extends Error {}
interface Store {
  documents: Map<string, ImportedDocument>;
  history: HistoryState;
  busy: boolean;
  error: string | null;
  addFiles: (files: File[], importDocument: ImportDocument) => Promise<void>;
  restore: (documents: Map<string, ImportedDocument>, workspace: WorkspaceState) => void;
  select: (id: string, add: boolean) => void;
  rotate: (degrees: 90 | -90) => void;
  rotatePage: (id: string, degrees: 90 | -90) => void;
  remove: () => void;
  duplicate: () => void;
  move: (id: string, direction: -1 | 1) => void;
  reorder: (id: string, targetId: string) => void;
  undo: () => void;
  redo: () => void;
  clearError: () => void;
}
export const useWorkspaceStore = create<Store>((set, get) => ({
  documents: new Map(), history: createHistory(emptyWorkspace()), busy: false, error: null,
  async addFiles(files, importDocument) {
    set({ busy: true, error: null });
    try {
      const docs: ImportedDocument[] = [];
      for (const file of files) docs.push(await importDocument(file));
      const map = new Map(get().documents);
      let next = get().history.present;
      for (const doc of docs) {
        map.set(doc.id, doc);
        next = appendPages(next, doc.pages.map(page => ({
          id: newId(), sourceDocumentId: doc.id, sourcePageIndex: page.sourcePageIndex, rotation: 0,
        })));
      }
      set({ documents: map, history: commit(get().history, next), busy: false });
    } catch (error) {
      set({ busy: false, error: error instanceof ImportCancelled ? null :
        error instanceof Error ? error.message : 'Import failed' });
    }
  },
  restore(documents, workspace) { set({ documents, history: createHistory(workspace), error: null }); },
  select(id, add) { set(s => ({ history: { ...s.history, present: toggleSelection(s.history.present, id, add) } })); },
  rotate(d) { set(s => ({ history: commit(s.history, rotatePages(s.history.present, s.history.present.selectedPageIds, d)) })); },
  rotatePage(id, d) { set(s => ({ history: commit(s.history, rotatePages(s.history.present, [id], d)) })); },
  remove() { set(s => ({ history: commit(s.history, deletePages(s.history.present, s.history.present.selectedPageIds)) })); },
  duplicate() { set(s => ({ history: commit(s.history, duplicatePages(s.history.present, s.history.present.selectedPageIds, newId)) })); },
  move(id, d) {
    set(s => { const next = movePage(s.history.present, id, d); return next === s.history.present ? s : { history: commit(s.history, next) }; });
  },
  reorder(id, targetId) {
    set(s => { const next = reorderPage(s.history.present, id, targetId); return next === s.history.present ? s : { history: commit(s.history, next) }; });
  },
  undo() { set(s => ({ history: undo(s.history) })); },
  redo() { set(s => ({ history: redo(s.history) })); },
  clearError() { set({ error: null }); },
}));
