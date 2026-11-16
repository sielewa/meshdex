import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { RetryPolicy } from './domain/retry-policy.interface';

@Injectable()
export class TasksService {
  constructor(
    @InjectPinoLogger(TasksService.name)
    private readonly logger: PinoLogger,
  ) {}

  /** `limit` loops share one index. Workers handle per-item failures; a throw stops the run. */
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

  /** Full jitter, so parallel retries don't hit a server in lockstep. */
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
