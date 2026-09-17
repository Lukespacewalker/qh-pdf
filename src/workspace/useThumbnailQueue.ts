import { useMemo } from 'react';
import type { PdfEngine } from '../engine/PdfEngine';

export interface ThumbnailTicket<T> {
  promise: Promise<T>;
  cancel(): void;
  setPriority(priority: number): void;
}

interface QueueJob<T> {
  key: string;
  priority: number;
  sequence: number;
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  started: boolean;
  cancelled: boolean;
  settled: boolean;
}

const abortError = () => new DOMException('Thumbnail request cancelled', 'AbortError');

export class ThumbnailQueue {
  private readonly pending: QueueJob<unknown>[] = [];
  private active = 0;
  private sequence = 0;

  constructor(private readonly concurrency = 3) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Thumbnail concurrency must be at least 1');
  }

  schedule<T>(key: string, priority: number, task: () => Promise<T>): ThumbnailTicket<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    const job: QueueJob<T> = {
      key,
      priority,
      sequence: this.sequence++,
      task,
      resolve,
      reject,
      started: false,
      cancelled: false,
      settled: false,
    };
    this.pending.push(job as QueueJob<unknown>);
    this.pump();

    return {
      promise,
      cancel: () => {
        if (job.cancelled || job.settled) return;
        job.cancelled = true;
        job.settled = true;
        job.reject(abortError());
        this.pump();
      },
      setPriority: nextPriority => {
        if (job.started || job.cancelled || job.settled || nextPriority === job.priority) return;
        job.priority = nextPriority;
        this.pump();
      },
    };
  }

  private pump(): void {
    this.pending.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
    while (this.active < this.concurrency) {
      const index = this.pending.findIndex(job => !job.started && !job.cancelled);
      if (index < 0) {
        this.dropCancelledPending();
        return;
      }
      const job = this.pending.splice(index, 1)[0];
      job.started = true;
      this.active += 1;
      void Promise.resolve()
        .then(() => job.task())
        .then(value => {
          if (!job.cancelled && !job.settled) {
            job.settled = true;
            job.resolve(value);
          }
        })
        .catch(error => {
          if (!job.cancelled && !job.settled) {
            job.settled = true;
            job.reject(error);
          }
        })
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
    this.dropCancelledPending();
  }

  private dropCancelledPending(): void {
    for (let index = this.pending.length - 1; index >= 0; index--) {
      if (this.pending[index].cancelled) this.pending.splice(index, 1);
    }
  }
}

const queues = new WeakMap<PdfEngine, ThumbnailQueue>();

export function useThumbnailQueue(engine: PdfEngine): ThumbnailQueue {
  return useMemo(() => {
    let queue = queues.get(engine);
    if (!queue) {
      queue = new ThumbnailQueue(3);
      queues.set(engine, queue);
    }
    return queue;
  }, [engine]);
}
