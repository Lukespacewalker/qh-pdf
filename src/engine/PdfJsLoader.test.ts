import { describe, expect, it, vi } from 'vitest';
import { createPdfJsLoader } from './PdfJsLoader';

describe('PDF.js runtime loader', () => {
  it('shares one in-flight module load across concurrent callers', async () => {
    let resolve!: (runtime: { getDocument: string }) => void;
    const pending = new Promise<{ getDocument: string }>(done => { resolve = done; });
    const importRuntime = vi.fn(() => pending);
    const load = createPdfJsLoader(importRuntime);

    const first = load();
    const second = load();
    expect(importRuntime).toHaveBeenCalledOnce();
    expect(second).toBe(first);

    resolve({ getDocument: 'ready' });
    await expect(first).resolves.toEqual({ getDocument: 'ready' });
  });

  it('clears a rejected application promise so a later call can retry', async () => {
    const runtime = { getDocument: 'ready' };
    const importRuntime = vi.fn()
      .mockRejectedValueOnce(new Error('transient chunk failure'))
      .mockResolvedValueOnce(runtime);
    const load = createPdfJsLoader(importRuntime);

    await expect(load()).rejects.toThrow('transient chunk failure');
    await expect(load()).resolves.toBe(runtime);
    expect(importRuntime).toHaveBeenCalledTimes(2);
  });
});
