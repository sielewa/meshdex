import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { RetryPolicy } from './domain/retry-policy.interface';

/** Bounded concurrency and retries, shared by `fetch` and `import`. */
@Injectable()
export class TaskRunnerService {
  constructor(
    @InjectPinoLogger(TaskRunnerService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Runs `worker` over `items` with at most `limit` calls in flight: `limit` loops share one
   * index, each taking the next item when its previous one finishes. Workers are expected to
   * handle their own per-item failures; one that throws stops the loops from taking new items
   * and the call rejects with that error once the calls already in flight have settled.
   */
  async forEach<T>(
    items: readonly T[],
    limit: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let next = 0;
    let failed = false;
    const loops = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (!failed && next < items.length) {
        const item = items[next] as T;

        next += 1;

        try {
          await worker(item);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    });
    const results = await Promise.allSettled(loops);
    const rejected = results.find((result) => result.status === 'rejected');

    if (rejected !== undefined) {
      throw rejected.reason;
    }
  }

  /**
   * Retries transient failures with exponential backoff and full jitter (a random delay below
   * a doubling cap), so parallel retries don't hit a server in lockstep. Errors the policy
   * doesn't call retryable, and the caller's abort, fail at once.
   */
  async retry<T>(
    operation: () => Promise<T>,
    policy: RetryPolicy,
    signal: AbortSignal,
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (signal.aborted || !policy.isRetryable(error) || attempt >= policy.attempts) {
          throw error;
        }

        const cap = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt);

        this.logger.debug({ attempt, err: error }, 'Retrying after a transient failure');
        await sleep(Math.random() * cap, undefined, { signal });
      }
    }
  }
}
