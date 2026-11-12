/**
 * Runs `worker` over `items` with at most `limit` calls in flight — a bounded pool, the
 * simplest form of backpressure: the next item starts only when a slot frees up, so
 * memory and open connections stay constant however many items there are.
 *
 * Fails fast: after the first error (or an abort) no new item starts; calls already in
 * flight are allowed to settle, then the first error is thrown.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  let firstError: unknown = null;

  const runSlot = async (): Promise<void> => {
    while (firstError === null && next < items.length) {
      if (signal?.aborted) {
        firstError ??= signal.reason;

        return;
      }

      const item = items[next] as T;
      next += 1;

      try {
        await worker(item);
      } catch (error) {
        firstError ??= error;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runSlot));

  if (firstError !== null) {
    throw firstError instanceof Error
      ? firstError
      : new Error('Worker failed', { cause: firstError });
  }
}
