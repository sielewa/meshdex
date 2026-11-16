import type { PinoLogger } from 'nestjs-pino';
import { TasksService } from './tasks.service';

const logger = { debug: jest.fn() } as unknown as PinoLogger;
const policy = {
  attempts: 3,
  baseDelayMs: 1,
  maxDelayMs: 1,
  isRetryable: (error: unknown) => error instanceof Error && error.message === 'transient',
};

describe('TasksService', () => {
  const tasks = new TasksService(logger);
  const signal = new AbortController().signal;

  describe('forEach', () => {
    it('visits every item with at most `limit` calls in flight', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const seen: number[] = [];

      await tasks.forEach([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2));
        seen.push(item);
        inFlight -= 1;
      });

      expect(maxInFlight).toBe(3);
      expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('stops taking items after a worker throws and rejects with that error', async () => {
      const started: number[] = [];
      const failure = new Error('bug');

      await expect(
        tasks.forEach([1, 2, 3, 4], 1, async (item) => {
          started.push(item);
          await Promise.resolve();

          if (item === 2) {
            throw failure;
          }
        }),
      ).rejects.toBe(failure);
      expect(started).toEqual([1, 2]);
    });
  });

  describe('retry', () => {
    it('repeats retryable failures until the operation succeeds', async () => {
      const operation = jest
        .fn<Promise<string>, []>()
        .mockRejectedValueOnce(new Error('transient'))
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue('ok');

      await expect(tasks.retry(operation, policy, signal)).resolves.toBe('ok');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('gives up after the last attempt', async () => {
      const operation = jest.fn<Promise<string>, []>().mockRejectedValue(new Error('transient'));

      await expect(tasks.retry(operation, policy, signal)).rejects.toThrow('transient');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('fails at once on an error the policy does not retry', async () => {
      const operation = jest.fn<Promise<string>, []>().mockRejectedValue(new Error('permanent'));

      await expect(tasks.retry(operation, policy, signal)).rejects.toThrow('permanent');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('does not retry once the caller aborted', async () => {
      const controller = new AbortController();
      const operation = jest.fn<Promise<string>, []>().mockImplementation(() => {
        controller.abort();

        return Promise.reject(new Error('transient'));
      });

      await expect(tasks.retry(operation, policy, controller.signal)).rejects.toThrow('transient');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
