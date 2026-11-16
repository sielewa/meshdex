import { QueueClosedException } from './exceptions/queue-closed.exception';

/**
 * Backpressure for whole items between pipeline stages (ADR 013): `push` waits while full, so a
 * slow consumer pauses producers instead of letting items pile up in memory.
 */
export class BoundedQueue<T> {
  private readonly items: T[] = [];
  private readonly takers: {
    resolve: (item: T | undefined) => void;
    reject: (reason: unknown) => void;
  }[] = [];
  private readonly pushers: { resolve: () => void; reject: (reason: unknown) => void }[] = [];
  private closed = false;
  private aborted = false;
  private abortReason: unknown;

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`Queue capacity must be a positive integer, got ${String(capacity)}`);
    }
  }

  get size(): number {
    return this.items.length;
  }

  async push(item: T): Promise<void> {
    // A woken producer re-checks: another one may have taken the free slot first.
    for (;;) {
      this.throwIfAborted();

      if (this.closed) {
        throw new QueueClosedException('Push after the queue was closed');
      }

      const taker = this.takers.shift();

      if (taker !== undefined) {
        taker.resolve(item);

        return;
      }

      if (this.items.length < this.capacity) {
        this.items.push(item);

        return;
      }

      await new Promise<void>((resolve, reject) => {
        this.pushers.push({
          resolve,
          reject,
        });
      });
    }
  }

  async take(): Promise<T | undefined> {
    this.throwIfAborted();

    if (this.items.length > 0) {
      const item = this.items.shift() as T;

      this.pushers.shift()?.resolve();

      return item;
    }

    if (this.closed) {
      return undefined;
    }

    return new Promise<T | undefined>((resolve, reject) => {
      this.takers.push({
        resolve,
        reject,
      });
    });
  }

  /** No more pushes: consumers drain what is left and then get `undefined`. */
  close(): void {
    this.closed = true;

    for (const taker of this.takers.splice(0)) {
      taker.resolve(undefined);
    }
  }

  /** Stops both sides: waiting and later `push`/`take` calls reject with `reason`. */
  abort(reason: unknown): void {
    if (this.aborted) {
      return;
    }

    this.aborted = true;
    this.abortReason = reason;
    this.items.length = 0;

    for (const waiter of [...this.takers.splice(0), ...this.pushers.splice(0)]) {
      waiter.reject(reason);
    }
  }

  private throwIfAborted(): void {
    if (this.aborted) {
      throw this.abortReason;
    }
  }
}
