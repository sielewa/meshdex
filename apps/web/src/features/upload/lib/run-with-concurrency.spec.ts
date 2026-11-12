import { describe, expect, it } from 'vitest';
import { runWithConcurrency } from '@/features/upload/lib/run-with-concurrency';

/** A task that resolves when told to, so the test controls interleaving. */
const deferred = (): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (e: Error) => void;
} => {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
};

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('runWithConcurrency', () => {
  it('never runs more than the limit at once and processes every item', async () => {
    const tasks = Array.from({ length: 10 }, () => deferred());
    const started: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    const run = runWithConcurrency([...tasks.keys()], 3, async (index) => {
      started.push(index);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tasks[index]?.promise;
      inFlight -= 1;
    });

    for (const task of tasks) {
      await flush();
      task.resolve();
    }
    await run;

    expect(maxInFlight).toBe(3);
    expect(started.sort((a, b) => a - b)).toEqual([...tasks.keys()]);
  });

  it('starts nothing new after a failure and rethrows the first error', async () => {
    const started: number[] = [];

    await expect(
      runWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (index) => {
        started.push(index);
        await flush();

        if (index === 1) {
          throw new Error('part 1 failed');
        }
      }),
    ).rejects.toThrow('part 1 failed');
    expect(started.length).toBeLessThan(6);
  });

  it('stops starting items once aborted', async () => {
    const controller = new AbortController();
    const started: number[] = [];

    await expect(
      runWithConcurrency(
        [0, 1, 2, 3, 4],
        1,
        async (index) => {
          started.push(index);

          if (index === 1) {
            controller.abort(new Error('cancelled'));
          }
          await flush();
        },
        controller.signal,
      ),
    ).rejects.toThrow('cancelled');
    expect(started).toEqual([0, 1]);
  });
});
