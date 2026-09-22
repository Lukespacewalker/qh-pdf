import { expect, it } from 'vitest';
import { cropPages, duplicatePages, rotatePages, type WorkspaceState } from './workspace';
import { createHistory, commit, undo } from './workspaceCommands';
import { isValidCrop } from './crop';

const state: WorkspaceState = { pages: [{ id: 'a', sourceDocumentId: 'doc', sourcePageIndex: 0, rotation: 0 },
  { id: 'b', sourceDocumentId: 'doc', sourcePageIndex: 1, rotation: 0 }], selectedPageIds: ['a'] };
it('crops only selected pages and restores the prior edit on undo', () => {
  const result = cropPages(state, ['a'], { top: 0.1, right: 0.2, bottom: 0.3, left: 0.1 });
  expect(result.pages[1]).toBe(state.pages[1]);
  expect(state.pages[0].crop).toBeUndefined();
  expect(undo(commit(createHistory(state), result)).present).toEqual(state);
  expect(cropPages(result, ['a']).pages[0].crop).toBeUndefined();
});
it('rotates the kept area with the content and gives duplicates independent edits', () => {
  const cropped = cropPages(state, ['a'], { top: 0.1, right: 0.2, bottom: 0.3, left: 0.1 });
  const rotated = rotatePages(cropped, ['a'], 90);
  expect(rotated.pages[0].crop).toEqual({ top: 0.1, right: 0.1, bottom: 0.2, left: 0.3 });
  expect(rotatePages(rotated, ['a'], -90)).toEqual(cropped);
  const copied = duplicatePages(cropped, ['a'], () => 'copy');
  const edited = cropPages(copied, ['copy'], { top: 0, right: 0, bottom: 0, left: 0.5 });
  expect(edited.pages[0].crop).toEqual(cropped.pages[0].crop);
  expect(edited.pages[1].crop?.left).toBe(0.5);
});
it.each([null, {}, { top: NaN, right: 0, bottom: 0, left: 0 },
  { top: 0.5, bottom: 0.5, left: 0, right: 0 }, { top: -0.1, bottom: 0, left: 0, right: 0 }])('rejects malformed or empty crop %j', value => {
  expect(isValidCrop(value)).toBe(false);
});
