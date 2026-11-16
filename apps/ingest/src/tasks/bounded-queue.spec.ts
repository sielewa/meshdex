import { BoundedQueue } from './bounded-queue';
import { QueueClosedException } from './exceptions/queue-closed.exception';

/** Lets pending promise callbacks run. */
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('BoundedQueue', () => {
  it('hands items out in FIFO order', async () => {
    const queue = new BoundedQueue<number>(3);

    await queue.push(1);
    await queue.push(2);
    await queue.push(3);

    expect([await queue.take(), await queue.take(), await queue.take()]).toEqual([1, 2, 3]);
  });

  it('makes a producer wait while full and lets it in when an item is taken', async () => {
    const queue = new BoundedQueue<string>(1);
    let pushed = false;

    await queue.push('a');
    const waiting = queue.push('b').then(() => {
      pushed = true;
    });

    await tick();
    expect(pushed).toBe(false);
    expect(queue.size).toBe(1);

    expect(await queue.take()).toBe('a');
    await waiting;
    expect(pushed).toBe(true);
    expect(await queue.take()).toBe('b');
  });

  it('hands an item straight to a waiting consumer', async () => {
    const queue = new BoundedQueue<string>(1);
    const taken = queue.take();

    await queue.push('a');

    expect(await taken).toBe('a');
    expect(queue.size).toBe(0);
  });

  it('lets consumers drain after close, then returns undefined', async () => {
    const queue = new BoundedQueue<string>(2);
    const idle = queue.take();

    await queue.push('a');
    await queue.push('b');
    queue.close();

    expect(await idle).toBe('a');
    expect(await queue.take()).toBe('b');
    expect(await queue.take()).toBeUndefined();
    await expect(queue.push('c')).rejects.toThrow(QueueClosedException);
  });

  it('wakes waiting consumers with undefined on close', async () => {
    const queue = new BoundedQueue<string>(1);
    const waiting = [queue.take(), queue.take()];

    queue.close();

    expect(await Promise.all(waiting)).toEqual([undefined, undefined]);
  });

  it('rejects waiting producers and consumers, and later calls, on abort', async () => {
    const reason = new Error('Interrupted');
    const full = new BoundedQueue<string>(1);
    const empty = new BoundedQueue<string>(1);

    await full.push('a');
    const producer = full.push('b');
    const consumer = empty.take();

    full.abort(reason);
    empty.abort(reason);

    await expect(producer).rejects.toBe(reason);
    await expect(consumer).rejects.toBe(reason);
    await expect(full.take()).rejects.toBe(reason);
    expect(full.size).toBe(0);
  });

  it('rejects a capacity below one', () => {
    expect(() => new BoundedQueue(0)).toThrow(RangeError);
  });
});
