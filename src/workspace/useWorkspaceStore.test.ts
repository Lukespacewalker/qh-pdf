import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceState } from '../domain/workspace';
import { useWorkspaceStore } from './useWorkspaceStore';

const workspace: WorkspaceState = {
  pages: [
    { id: 'first', sourceDocumentId: 'doc', sourcePageIndex: 0, rotation: 0 },
    { id: 'viewed', sourceDocumentId: 'doc', sourcePageIndex: 1, rotation: 0 },
    { id: 'third', sourceDocumentId: 'doc', sourcePageIndex: 2, rotation: 0 },
  ],
  selectedPageIds: ['first', 'third'],
};

describe('preview page rotation', () => {
  beforeEach(() => useWorkspaceStore.getState().restore(new Map(), workspace));

  it('rotates only the viewed page without changing selection and remains undoable', () => {
    const store = useWorkspaceStore.getState();
    store.rotatePage('viewed', 90);

    expect(useWorkspaceStore.getState().history.present).toEqual({
      pages: [
        { id: 'first', sourceDocumentId: 'doc', sourcePageIndex: 0, rotation: 0 },
        { id: 'viewed', sourceDocumentId: 'doc', sourcePageIndex: 1, rotation: 90 },
        { id: 'third', sourceDocumentId: 'doc', sourcePageIndex: 2, rotation: 0 },
      ],
      selectedPageIds: ['first', 'third'],
    });

    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().history.present).toEqual(workspace);
  });
});

describe('selection anchor and history', () => {
  const rangeWorkspace: WorkspaceState = {
    pages: ['a', 'b', 'c', 'd', 'e'].map((id, sourcePageIndex) => ({
      id, sourceDocumentId: 'doc', sourcePageIndex, rotation: 0,
    })),
    selectedPageIds: [],
  };

  beforeEach(() => useWorkspaceStore.getState().restore(new Map(), rangeWorkspace));

  it('keeps the anchor across forward, reverse and additive Shift ranges', () => {
    const store = useWorkspaceStore.getState();
    store.select('b', { additive: false, range: false });
    store.select('d', { additive: false, range: true });
    expect(useWorkspaceStore.getState().history.present.selectedPageIds).toEqual(['b', 'c', 'd']);
    expect(useWorkspaceStore.getState().selectionAnchorId).toBe('b');

    store.select('a', { additive: true, range: true });
    expect(useWorkspaceStore.getState().history.present.selectedPageIds).toEqual(['b', 'c', 'd', 'a']);
    expect(useWorkspaceStore.getState().selectionAnchorId).toBe('b');
  });

  it('uses anchor identity after reorder and does not retarget it to a duplicate', () => {
    const store = useWorkspaceStore.getState();
    store.select('b', { additive: false, range: false });
    store.reorder('e', 'a');
    store.duplicate();
    const afterDuplicate = useWorkspaceStore.getState().history.present;
    const duplicateId = afterDuplicate.pages.find((page, index) => index > 0 && page.sourcePageIndex === 1 && page.id !== 'b')?.id;
    expect(duplicateId).toBeTruthy();
    store.select('d', { additive: false, range: true });

    const selected = useWorkspaceStore.getState().history.present.selectedPageIds;
    expect(selected).toContain('b');
    expect(selected).toContain(duplicateId);
    expect(selected.at(-1)).toBe('d');
    expect(useWorkspaceStore.getState().selectionAnchorId).toBe('b');
  });

  it('clears a deleted anchor and falls back to a new single-page anchor after undo', () => {
    const store = useWorkspaceStore.getState();
    store.select('b', { additive: false, range: false });
    store.remove();
    expect(useWorkspaceStore.getState().selectionAnchorId).toBeNull();
    store.undo();
    store.select('d', { additive: false, range: true });

    expect(useWorkspaceStore.getState().history.present.selectedPageIds).toEqual(['d']);
    expect(useWorkspaceStore.getState().selectionAnchorId).toBe('d');
  });

  it('select all, deselect all and restore clear the anchor without adding history entries', () => {
    const store = useWorkspaceStore.getState();
    store.select('c', { additive: false, range: false });
    const past = useWorkspaceStore.getState().history.past;
    store.selectAll();
    expect(useWorkspaceStore.getState().history.present.selectedPageIds).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(useWorkspaceStore.getState().history.past).toBe(past);
    expect(useWorkspaceStore.getState().selectionAnchorId).toBeNull();
    store.deselectAll();
    expect(useWorkspaceStore.getState().history.present.selectedPageIds).toEqual([]);
    store.restore(new Map(), rangeWorkspace);
    expect(useWorkspaceStore.getState().selectionAnchorId).toBeNull();
  });

  it('undo and redo clear an anchor that is absent from the resulting workspace', () => {
    const withoutB: WorkspaceState = {
      pages: rangeWorkspace.pages.filter(page => page.id !== 'b'), selectedPageIds: [],
    };
    useWorkspaceStore.setState({
      history: { past: [withoutB], present: rangeWorkspace, future: [] },
      selectionAnchorId: 'b',
    });

    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().selectionAnchorId).toBeNull();
    useWorkspaceStore.getState().redo();
    expect(useWorkspaceStore.getState().selectionAnchorId).toBeNull();
  });
});
