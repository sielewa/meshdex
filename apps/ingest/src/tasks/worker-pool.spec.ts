import { WorkerPoolException } from './exceptions/worker-pool.exception';
import { WorkerPool } from './worker-pool';

/**
 * Real worker threads running inline code (`eval: true`). Each doubles a number after 10 ms
 * and reports its thread id; a Uint8Array is sent back by transfer; 'crash' throws.
 */
const WORKER = `
const { parentPort, threadId } = require('node:worker_threads');
parentPort.on('message', (request) => {
  if (request === 'crash') {
    throw new Error('boom');
  }
  if (request instanceof Uint8Array) {
    parentPort.postMessage(request, [request.buffer]);
    return;
  }
  setTimeout(() => parentPort.postMessage({ value: request * 2, threadId }), 10);
});
`;

describe('WorkerPool', () => {
  let pool: WorkerPool<unknown, unknown>;

  beforeEach(() => {
    pool = new WorkerPool(WORKER, 2, { eval: true });
  });

  afterEach(async () => {
    await pool.close();
  });

  it('answers every request, spreading them over its workers', async () => {
    const responses = (await Promise.all([1, 2, 3, 4, 5, 6].map((value) => pool.run(value)))) as {
      value: number;
      threadId: number;
    }[];

    expect(responses.map((response) => response.value)).toEqual([2, 4, 6, 8, 10, 12]);
    expect(new Set(responses.map((response) => response.threadId)).size).toBe(2);
  });

  it('moves a transferred buffer instead of copying it', async () => {
    const bytes = Uint8Array.from([1, 2, 3]);

    const echoed = (await pool.run(bytes, [bytes.buffer])) as Uint8Array;

    // The sender's buffer is detached; the bytes came back through the other thread.
    expect(bytes.byteLength).toBe(0);
    expect([...echoed]).toEqual([1, 2, 3]);
  });

  it('fails the request of a crashed worker and every later one', async () => {
    await expect(pool.run('crash')).rejects.toThrow(WorkerPoolException);
    await expect(pool.run(1)).rejects.toThrow(WorkerPoolException);
  });

  it('rejects requests after close', async () => {
    await pool.close();

    await expect(pool.run(1)).rejects.toThrow('The worker pool is closed');
  });
});
