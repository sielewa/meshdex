import { QueueClosedException } from './exceptions/queue-closed.exception';

/**
 * A FIFO queue between two pipeline stages that holds at most `capacity` items (ADR 013).
 *
 * `push` waits while the queue is full, so a slow consumer stage pauses the producer stage
 * instead of letting finished items pile up in memory: backpressure, as `stream.pipeline`
 * does for bytes, but for whole items (packed models) and several workers on each side.
 * `take` waits while the queue is empty and returns `undefined` once producers have called
 * `close` and everything was taken. `abort` fails every waiting and future call, so no
 * worker stays blocked when the run stops.
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

  /** Items waiting for a consumer (not counting ones handed straight to a waiting consumer). */
  get size(): number {
    return this.items.length;
  }

  async push(item: T): Promise<void> {
    // A loop, not a single wait: a woken producer re-checks, because another producer may
    // have taken the free slot first, or a consumer may now be waiting for a direct hand-off.
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

      // A slot is free: let one waiting producer in.
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
