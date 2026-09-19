import { abortError } from './abort';

type Render = (signal: AbortSignal) => Promise<Blob>;
interface Subscriber { resolve: (blob: Blob) => void; reject: (error: unknown) => void; cleanup: () => void }
interface Job { key: string; render: Render; controller: AbortController; priority: number; subscribers: Set<Subscriber> }

/** Bounded work and LRU Blob cache. Individual subscribers own their object URLs. */
export class PreviewQueue {
  private running = 0;
  private scheduled = false;
  private waiting: Job[] = [];
  private jobs = new Map<string, Job>();
  private cache = new Map<string, Blob>();
  private cacheBytes = 0;
  constructor(private limit = 3, private maxBytes = 16 * 1024 * 1024, private maxEntries = 64) {
    if (!Number.isInteger(limit) || limit < 1 || maxBytes < 0 || maxEntries < 0) throw new Error('Invalid preview limits');
  }

  request(key: string, render: Render, options: { signal?: AbortSignal; priority?: number } = {}): Promise<Blob> {
    if (options.signal?.aborted) return Promise.reject(abortError());
    const cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cache.set(key, cached); return Promise.resolve(cached); }
    let job = this.jobs.get(key);
    if (!job) {
      job = { key, render, controller: new AbortController(), priority: options.priority ?? 10, subscribers: new Set() };
      this.jobs.set(key, job); this.waiting.push(job);
    } else job.priority = Math.min(job.priority, options.priority ?? 10);
    const current = job;
    return new Promise((resolve, reject) => {
      const subscriber: Subscriber = { resolve, reject, cleanup: () => options.signal?.removeEventListener('abort', cancel) };
      const cancel = () => {
        if (!current.subscribers.delete(subscriber)) return;
        subscriber.cleanup(); reject(abortError());
        if (!current.subscribers.size) {
          if (this.jobs.get(key) === current) this.jobs.delete(key);
          current.controller.abort();
        }
      };
      current.subscribers.add(subscriber);
      options.signal?.addEventListener('abort', cancel, { once: true });
      if (options.signal?.aborted) cancel();
      this.pumpSoon();
    });
  }

  clear(): void {
    for (const job of this.jobs.values()) {
      for (const subscriber of job.subscribers) { subscriber.cleanup(); subscriber.reject(abortError()); }
      job.subscribers.clear(); job.controller.abort();
    }
    this.jobs.clear(); this.waiting = []; this.cache.clear(); this.cacheBytes = 0;
  }

  private pumpSoon() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; this.pump(); });
  }
  private pump() {
    this.waiting.sort((a, b) => a.priority - b.priority);
    while (this.running < this.limit && this.waiting.length) {
      const job = this.waiting.shift()!;
      if (job.controller.signal.aborted || !job.subscribers.size) continue;
      this.running++;
      Promise.resolve().then(() => job.render(job.controller.signal)).then(blob => {
        if (job.controller.signal.aborted) return;
        if (blob.size <= this.maxBytes && this.maxEntries > 0) {
          this.cache.set(job.key, blob); this.cacheBytes += blob.size;
          while (this.cacheBytes > this.maxBytes || this.cache.size > this.maxEntries) {
            const oldest = this.cache.keys().next().value!;
            this.cacheBytes -= this.cache.get(oldest)!.size; this.cache.delete(oldest);
          }
        }
        for (const subscriber of job.subscribers) { subscriber.cleanup(); subscriber.resolve(blob); }
      }, error => {
        for (const subscriber of job.subscribers) { subscriber.cleanup(); subscriber.reject(error); }
      }).finally(() => {
        job.subscribers.clear();
        if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
        this.running--; this.pumpSoon();
      });
    }
  }
}
