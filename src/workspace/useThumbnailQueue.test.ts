import { describe, expect, it } from 'vitest';
import { ThumbnailQueue } from './useThumbnailQueue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('ThumbnailQueue', () => {
  it('runs newly visible work before older off-screen pending work', async () => {
    const queue = new ThumbnailQueue(1);
    const order: string[] = [];
    const gate = deferred<void>();

    const first = queue.schedule('first', 1, async () => {
      order.push('first');
      await gate.promise;
      return 'first';
    });
    const second = queue.schedule('second', 1, async () => { order.push('second'); return 'second'; });
    const visible = queue.schedule('visible', 0, async () => { order.push('visible'); return 'visible'; });

    gate.resolve();
    await expect(first.promise).resolves.toBe('first');
    await expect(visible.promise).resolves.toBe('visible');
    await expect(second.promise).resolves.toBe('second');
    expect(order).toEqual(['first', 'visible', 'second']);
  });

  it('never exceeds the configured concurrency', async () => {
    const queue = new ThumbnailQueue(3);
    const gates = Array.from({ length: 6 }, () => deferred<void>());
    let running = 0;
    let maxRunning = 0;

    const tickets = gates.map((gate, index) => queue.schedule(`job-${index}`, 1, async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await gate.promise;
      running -= 1;
      return index;
    }));

    await Promise.resolve();
    expect(maxRunning).toBe(3);
    gates.forEach(gate => gate.resolve());
    await Promise.all(tickets.map(ticket => ticket.promise));
    expect(maxRunning).toBe(3);
  });

  it('cancels pending work and ignores an active result after cancellation', async () => {
    const queue = new ThumbnailQueue(1);
    const gate = deferred<string>();
    let pendingRan = false;

    const active = queue.schedule('active', 0, () => gate.promise);
    const pending = queue.schedule('pending', 1, async () => { pendingRan = true; return 'pending'; });
    pending.cancel();
    await expect(pending.promise).rejects.toMatchObject({ name: 'AbortError' });

    active.cancel();
    gate.resolve('late');
    await expect(active.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(pendingRan).toBe(false);
  });

  it('can raise the priority of a pending job', async () => {
    const queue = new ThumbnailQueue(1);
    const gate = deferred<void>();
    const order: string[] = [];
    const first = queue.schedule('first', 0, async () => { order.push('first'); await gate.promise; });
    const a = queue.schedule('a', 1, async () => { order.push('a'); });
    const b = queue.schedule('b', 1, async () => { order.push('b'); });
    b.setPriority(0);
    gate.resolve();
    await Promise.all([first.promise, a.promise, b.promise]);
    expect(order).toEqual(['first', 'b', 'a']);
  });
});
