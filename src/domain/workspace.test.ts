import { describe, expect, it } from 'vitest';
import * as workspaceDomain from './workspace';
import type { WorkspacePage, WorkspaceState } from './workspace';

const pages = (): WorkspacePage[] => ['a', 'b', 'c', 'd', 'e'].map((id, sourcePageIndex) => ({
  id, sourceDocumentId: 'doc', sourcePageIndex, rotation: 0,
}));
const state = (selectedPageIds: string[] = []): WorkspaceState => ({ pages: pages(), selectedPageIds });

describe('workspace edits', () => {
  it('rotates the requested page', () => {
    expect(workspaceDomain.rotatePages(state(), ['a'], 90).pages[0].rotation).toBe(90);
  });

  it('deletes exactly the requested pages', () => {
    expect(workspaceDomain.deletePages(state(['b', 'd']), ['b', 'd']).pages.map(page => page.id))
      .toEqual(['a', 'c', 'e']);
  });

  it('duplicates the requested page beside its original', () => {
    expect(workspaceDomain.duplicatePages(state(['b']), ['b'], () => 'copy').pages.map(page => page.id))
      .toEqual(['a', 'b', 'copy', 'c', 'd', 'e']);
  });

  it('moves a page without drag', () => {
    expect(workspaceDomain.movePage(state(), 'b', -1).pages.map(page => page.id))
      .toEqual(['b', 'a', 'c', 'd', 'e']);
  });
});

describe('page selection', () => {
  it.each([
    ['forward', 'b', 'd', ['b', 'c', 'd']],
    ['reverse', 'd', 'b', ['b', 'c', 'd']],
  ])('selects an inclusive %s range in workspace order', (_name, anchor, target, expected) => {
    expect(workspaceDomain.selectPageRange(state(['e']), anchor, target, false).selectedPageIds).toEqual(expected);
  });

  it('adds an extended range without losing an existing selection', () => {
    expect(workspaceDomain.selectPageRange(state(['a', 'e']), 'b', 'd', true).selectedPageIds)
      .toEqual(['a', 'e', 'b', 'c', 'd']);
  });

  it('selects all pages and clears every selection', () => {
    expect(workspaceDomain.selectAllPages(state(['c'])).selectedPageIds).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(workspaceDomain.deselectAllPages(state(['a', 'c'])).selectedPageIds).toEqual([]);
  });

  it('never adds an unknown page to the selection', () => {
    expect(workspaceDomain.toggleSelection(state(['a']), 'missing', true).selectedPageIds).toEqual(['a']);
  });
});

describe('selected-page export snapshot', () => {
  it('uses workspace order rather than selection-click order without mutating the workspace', () => {
    const original = state(['e', 'b', 'd']);
    const snapshot = workspaceDomain.createSelectedExportWorkspace(original);

    expect(snapshot.pages.map(page => page.id)).toEqual(['b', 'd', 'e']);
    expect(snapshot.selectedPageIds).toEqual(['b', 'd', 'e']);
    expect(original.pages.map(page => page.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(original.selectedPageIds).toEqual(['e', 'b', 'd']);
    expect(snapshot.pages[0]).not.toBe(original.pages[1]);
  });

  it.each([
    ['empty', []],
    ['stale', ['b', 'missing']],
    ['duplicate', ['b', 'b']],
  ])('rejects an %s requested selection', (_name, selectedPageIds) => {
    expect(() => workspaceDomain.createSelectedExportWorkspace(state(selectedPageIds))).toThrow('selected pages');
  });
});
