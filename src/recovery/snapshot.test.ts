import { expect, it } from 'vitest';
import { createSnapshot, restoreSnapshot } from './snapshot';
import type { ImportedDocument } from '../engine/PdfEngine';

const doc: ImportedDocument = {
  id: 'source', fileName: 'synthetic.pdf', kind: 'pdf', mimeType: 'application/pdf',
  bytes: new Uint8Array([1, 2, 3]).buffer, pages: [{ sourcePageIndex: 0, width: 100, height: 100 }],
};
const workspace = { pages: [{ id: 'p', sourceDocumentId: 'source', sourcePageIndex: 0, rotation: 90 as const }], selectedPageIds: ['p'] };
it('saves only original source bytes and page edits, never decrypted bytes or passwords', () => {
  const sensitive = { ...doc, unlockedBytes: new Uint8Array([9]).buffer, password: 'synthetic-secret' };
  const snapshot = createSnapshot(new Map<string, ImportedDocument>([['source', sensitive], ['unused', { ...doc, id: 'unused' }]]), workspace);
  expect(snapshot.documents).toEqual([{ id: 'source', fileName: doc.fileName, mimeType: doc.mimeType, bytes: doc.bytes }]);
  expect(snapshot.workspace).toEqual(workspace);
});
it('refuses an incomplete snapshot instead of silently losing source pages', () => {
  expect(() => createSnapshot(new Map(), workspace)).toThrow();
});
it('reimports originals when restoring and preserves stable page references', async () => {
  const snapshot = createSnapshot(new Map([['source', doc]]), workspace);
  const result = await restoreSnapshot(snapshot, async file => {
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array(doc.bytes));
    return { ...doc, id: 'fresh-import-id' };
  });
  expect(result.documents.get('source')?.id).toBe('source');
  expect(result.workspace).toEqual(workspace);
});
it('rejects invalid page references and unsupported snapshots on restore', async () => {
  const snapshot = createSnapshot(new Map([['source', doc]]), workspace);
  snapshot.workspace.pages[0].sourcePageIndex = 99;
  await expect(restoreSnapshot(snapshot, async () => doc)).rejects.toThrow();
  await expect(restoreSnapshot({ ...snapshot, version: 999 }, async () => doc)).rejects.toThrow();
});
it('round-trips valid crop edits without sharing mutable settings', async () => {
  const crop = { top: 0.1, right: 0.2, bottom: 0.1, left: 0 };
  const snapshot = createSnapshot(new Map([['source', doc]]), { ...workspace, pages: [{ ...workspace.pages[0], crop }] });
  crop.top = 0.5;
  const restored = await restoreSnapshot(snapshot, async () => doc);
  expect(restored.workspace.pages[0].crop?.top).toBe(0.1);
});
it.each([null, {}, { top: 0.8, bottom: 0.2, left: 0, right: 0 }, { top: Infinity, bottom: 0, left: 0, right: 0 }])('rejects malformed stored crop instead of silently clearing it', async crop => {
  const saved = createSnapshot(new Map([['source', doc]]), workspace);
  Object.assign(saved.workspace.pages[0], { crop });
  await expect(restoreSnapshot(saved, async () => doc)).rejects.toThrow('could not be restored');
});
