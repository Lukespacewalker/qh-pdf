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
