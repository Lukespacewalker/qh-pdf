import { expect, it } from 'vitest';
import { reorderPage, type WorkspaceState } from './workspace';
import { commit, createHistory, undo } from './workspaceCommands';

const workspace: WorkspaceState = {
  pages: ['a', 'b', 'c', 'd'].map((id, sourcePageIndex) => ({
    id, sourceDocumentId: 'source', sourcePageIndex, rotation: 90,
  })), selectedPageIds: ['a'],
};
it('moves a page across other pages without losing selection or page properties', () => {
  const moved = reorderPage(workspace, 'a', 'd');
  expect(moved.pages.map(p => p.id)).toEqual(['b', 'c', 'd', 'a']);
  expect(moved.pages[3]).toBe(workspace.pages[0]);
  expect(moved.selectedPageIds).toEqual(['a']);
  expect(reorderPage(moved, 'a', 'b').pages).toEqual(workspace.pages);
  expect(undo(commit(createHistory(workspace), moved)).present).toBe(workspace);
});
it('ignores a cancelled, unchanged or invalid drop', () => {
  expect(reorderPage(workspace, 'a', 'a')).toBe(workspace);
  expect(reorderPage(workspace, 'missing', 'b')).toBe(workspace);
  expect(reorderPage(workspace, 'a', 'missing')).toBe(workspace);
});
