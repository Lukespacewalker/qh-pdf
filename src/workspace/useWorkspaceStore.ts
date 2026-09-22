import { create } from 'zustand';
import {
  appendPages, deletePages, deselectAllPages, duplicatePages, emptyWorkspace, movePage, reorderPage,
  rotatePages, sanitizeSelection, selectAllPages, selectPageRange, toggleSelection, type WorkspaceState,
} from '../domain/workspace';
import { commit, createHistory, redo, undo, type HistoryState } from '../domain/workspaceCommands';
import type { ImportedDocument } from '../engine/PdfEngine';
import { newId } from '../lib/ids';

export type ImportDocument = (file: File) => Promise<ImportedDocument>;
export class ImportCancelled extends Error {}
interface Store {
  documents: Map<string, ImportedDocument>;
  history: HistoryState;
  selectionAnchorId: string | null;
  busy: boolean;
  error: string | null;
  addFiles: (files: File[], importDocument: ImportDocument) => Promise<void>;
  restore: (documents: Map<string, ImportedDocument>, workspace: WorkspaceState) => void;
  select: (id: string, options: boolean | { additive: boolean; range: boolean }) => void;
  selectAll: () => void;
  deselectAll: () => void;
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
  documents: new Map(), history: createHistory(emptyWorkspace()), selectionAnchorId: null, busy: false, error: null,
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
  restore(documents, workspace) { set({ documents, history: createHistory(sanitizeSelection(workspace)), selectionAnchorId: null, error: null }); },
  select(id, input) {
    set(s => {
      if (!s.history.present.pages.some(page => page.id === id)) return s;
      const options = typeof input === 'boolean' ? { additive: input, range: false } : input;
      const anchorValid = s.selectionAnchorId !== null &&
        s.history.present.pages.some(page => page.id === s.selectionAnchorId);
      if (options.range && anchorValid) {
        return {
          history: {
            ...s.history,
            present: selectPageRange(s.history.present, s.selectionAnchorId!, id, options.additive),
          },
        };
      }
      return {
        history: {
          ...s.history,
          present: toggleSelection(s.history.present, id, options.range ? false : options.additive),
        },
        selectionAnchorId: id,
      };
    });
  },
  selectAll() {
    set(s => ({ history: { ...s.history, present: selectAllPages(s.history.present) }, selectionAnchorId: null }));
  },
  deselectAll() {
    set(s => ({ history: { ...s.history, present: deselectAllPages(s.history.present) }, selectionAnchorId: null }));
  },
  rotate(d) { set(s => ({ history: commit(s.history, rotatePages(s.history.present, s.history.present.selectedPageIds, d)) })); },
  rotatePage(id, d) { set(s => ({ history: commit(s.history, rotatePages(s.history.present, [id], d)) })); },
  remove() {
    set(s => {
      const history = commit(s.history, deletePages(s.history.present, s.history.present.selectedPageIds));
      const selectionAnchorId = s.selectionAnchorId &&
        history.present.pages.some(page => page.id === s.selectionAnchorId) ? s.selectionAnchorId : null;
      return { history, selectionAnchorId };
    });
  },
  duplicate() { set(s => ({ history: commit(s.history, duplicatePages(s.history.present, s.history.present.selectedPageIds, newId)) })); },
  move(id, d) {
    set(s => { const next = movePage(s.history.present, id, d); return next === s.history.present ? s : { history: commit(s.history, next) }; });
  },
  reorder(id, targetId) {
    set(s => { const next = reorderPage(s.history.present, id, targetId); return next === s.history.present ? s : { history: commit(s.history, next) }; });
  },
  undo() {
    set(s => {
      const history = undo(s.history);
      const selectionAnchorId = s.selectionAnchorId &&
        history.present.pages.some(page => page.id === s.selectionAnchorId) ? s.selectionAnchorId : null;
      return { history, selectionAnchorId };
    });
  },
  redo() {
    set(s => {
      const history = redo(s.history);
      const selectionAnchorId = s.selectionAnchorId &&
        history.present.pages.some(page => page.id === s.selectionAnchorId) ? s.selectionAnchorId : null;
      return { history, selectionAnchorId };
    });
  },
  clearError() { set({ error: null }); },
}));
