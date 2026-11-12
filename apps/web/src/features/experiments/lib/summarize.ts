/** Median and range of a metric over repeated runs. */
export interface Summary {
  n: number;
  median: number;
  min: number;
  max: number;
}

/**
 * Median, not mean: with a handful of runs one disturbed run (a GC pause, a background job)
 * would drag the mean, while the median stays with the typical run. The range shows the spread
 * instead of a standard deviation, which says little about 3–5 values.
 */
export function summarize(values: readonly number[]): Summary {
  if (values.length === 0) {
    throw new RangeError('Cannot summarize zero values');
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  // Indexes are in range: `sorted` is non-empty and `middle` < its length.
  const median =
    sorted.length % 2 === 1
      ? (sorted[middle] as number)
      : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;

  return {
    n: sorted.length,
    median,
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
  };
}
