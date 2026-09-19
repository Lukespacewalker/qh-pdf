import { describe, expect, it } from 'vitest';
import { rangeSelection, selectedWorkspace } from './selection';
import type { WorkspaceState } from './workspace';
const state: WorkspaceState = {
  pages: ['a', 'b', 'c', 'd'].map((id, sourcePageIndex) => ({ id, sourceDocumentId: 'source', sourcePageIndex, rotation: 0 })),
  selectedPageIds: ['d'],
};
describe('selection', () => {
  it('ranges in either direction using current page order', () => {
    expect(rangeSelection(state, 'c', 'a', false).selectedPageIds).toEqual(['a', 'b', 'c']);
    expect(rangeSelection(state, 'a', 'c', true).selectedPageIds).toEqual(['a', 'b', 'c', 'd']);
  });
  it('handles an anchor removed by editing without selecting unrelated pages', () => {
    expect(rangeSelection(state, 'missing', 'b', false).selectedPageIds).toEqual(['b']);
    expect(rangeSelection(state, 'a', 'missing', false)).toBe(state);
  });
  it('extracts in document order, not selection order, without modifying the workspace', () => {
    const original = { ...state, selectedPageIds: ['d', 'a'] };
    const snapshot = selectedWorkspace(original);
    expect(snapshot.pages.map(page => page.id)).toEqual(['a', 'd']);
    expect(original.pages).toHaveLength(4);
    expect(original.selectedPageIds).toEqual(['d', 'a']);
    expect(snapshot.pages[0]).not.toBe(original.pages[0]);
    expect(snapshot.selectedPageIds).toEqual([]);
  });
});
