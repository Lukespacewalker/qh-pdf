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
