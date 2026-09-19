import { describe, expect, it } from 'vitest';
import { ThumbnailScheduler } from './ThumbnailScheduler';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('ThumbnailScheduler', () => {
  it('runs no more than two jobs until an active job settles', async () => {
    const scheduler = new ThumbnailScheduler(2);
    const first = deferred<string>();
    const second = deferred<string>();
    const third = deferred<string>();
    const started: string[] = [];
    const one = scheduler.schedule(() => { started.push('one'); return first.promise; });
    const two = scheduler.schedule(() => { started.push('two'); return second.promise; });
    const three = scheduler.schedule(() => { started.push('three'); return third.promise; });

    expect(started).toEqual(['one', 'two']);
    first.resolve('first');
    await expect(one.promise).resolves.toBe('first');
    expect(started).toEqual(['one', 'two', 'three']);
    second.resolve('second');
    third.resolve('third');
    await expect(Promise.all([two.promise, three.promise])).resolves.toEqual(['second', 'third']);
  });

  it('starts higher-priority queued work before earlier low-priority work', async () => {
    const scheduler = new ThumbnailScheduler(1);
    const blocker = deferred<string>();
    const started: string[] = [];
    const running = scheduler.schedule(() => { started.push('running'); return blocker.promise; });
    const low = scheduler.schedule(async () => { started.push('low'); return 'low'; }, 10);
    const high = scheduler.schedule(async () => { started.push('high'); return 'high'; }, 100);

    blocker.resolve('running');
    await expect(running.promise).resolves.toBe('running');
    await expect(high.promise).resolves.toBe('high');
    await expect(low.promise).resolves.toBe('low');
    expect(started).toEqual(['running', 'high', 'low']);
  });

  it('cancels queued work without starting it', async () => {
    const scheduler = new ThumbnailScheduler(1);
    const blocker = deferred<string>();
    const running = scheduler.schedule(() => blocker.promise);
    let queuedStarted = false;
    const queued = scheduler.schedule(async () => { queuedStarted = true; return 'queued'; });

    queued.cancel();
    await expect(queued.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(queuedStarted).toBe(false);
    blocker.resolve('running');
    await expect(running.promise).resolves.toBe('running');
  });

  it('rejects an active consumer immediately but keeps the slot bounded until work settles', async () => {
    const scheduler = new ThumbnailScheduler(1);
    const activeResult = deferred<string>();
    const active = scheduler.schedule(() => activeResult.promise);
    let nextStarted = false;
    const next = scheduler.schedule(async () => { nextStarted = true; return 'next'; });

    active.cancel();
    await expect(active.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(nextStarted).toBe(false);
    activeResult.resolve('too late');
    await expect(next.promise).resolves.toBe('next');
    expect(nextStarted).toBe(true);
  });

  it('continues after one job fails', async () => {
    const scheduler = new ThumbnailScheduler(1);
    const failed = scheduler.schedule(async () => { throw new Error('render failed'); });
    const next = scheduler.schedule(async () => 'next');

    await expect(failed.promise).rejects.toThrow('render failed');
    await expect(next.promise).resolves.toBe('next');
  });
});
