export interface ScheduledThumbnail<T> {
  promise: Promise<T>;
  cancel(): void;
}

type JobState = 'queued' | 'active' | 'settled';

interface Job {
  priority: number;
  sequence: number;
  state: JobState;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

const cancelled = () => new DOMException('Thumbnail cancelled', 'AbortError');

export class ThumbnailScheduler {
  private readonly queue: Job[] = [];
  private active = 0;
  private sequence = 0;

  constructor(private readonly concurrency = 2) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError('Thumbnail concurrency must be a positive integer');
    }
  }

  schedule<T>(run: () => Promise<T>, priority = 0): ScheduledThumbnail<T> {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const job: Job = {
      priority,
      sequence: this.sequence++,
      state: 'queued',
      run,
      resolve: value => resolve(value as T),
      reject,
    };
    this.queue.push(job);
    this.pump();

    return {
      promise,
      cancel: () => {
        if (job.state === 'settled') return;
        if (job.state === 'active') this.active -= 1;
        job.state = 'settled';
        job.reject(cancelled());
        this.pump();
      },
    };
  }

  private pump() {
    this.queue.sort((left, right) => right.priority - left.priority || left.sequence - right.sequence);
    while (this.active < this.concurrency) {
      const job = this.queue.find(candidate => candidate.state === 'queued');
      if (!job) return;
      job.state = 'active';
      this.active += 1;
      let result: Promise<unknown>;
      try {
        result = job.run();
      } catch (error) {
        result = Promise.reject(error);
      }
      result.then(
        value => this.settle(job, () => job.resolve(value)),
        error => this.settle(job, () => job.reject(error)),
      );
    }
  }

  private settle(job: Job, complete: () => void) {
    if (job.state !== 'active') return;
    job.state = 'settled';
    this.active -= 1;
    complete();
    this.pump();
  }
}
