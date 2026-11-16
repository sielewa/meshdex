/** After the first error no new item starts; calls in flight settle, then it is thrown. */
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
