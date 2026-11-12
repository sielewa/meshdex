/**
 * Import options that choose the data a run works on. Runs with equal values (on the same
 * machine) did the same work, so they can be compared.
 */
export const WORKLOAD_OPTIONS = ['resolution', 'limit', 'ids'] as const;

/**
 * Import options that change how the same work is done: what an experiment varies. Together
 * with the Node.js version and the commit they tell configurations apart.
 */
export const CONFIGURATION_OPTIONS = [
  'packConcurrency',
  'packInWorkers',
  'uploadConcurrency',
  'queueSize',
] as const;

/**
 * Series colours (categorical slots of the data-viz palette, dark steps, validated against the
 * card surface #171717: every adjacent pair clears the colour-blindness check). Assigned by a
 * configuration's position in its workload, in this fixed order, never cycled.
 */
export const SERIES_COLORS = [
  'var(--chart-series-1)',
  'var(--chart-series-2)',
  'var(--chart-series-3)',
  'var(--chart-series-4)',
  'var(--chart-series-5)',
  'var(--chart-series-6)',
  'var(--chart-series-7)',
  'var(--chart-series-8)',
] as const;

/** For configurations past the eighth: identity then comes from the row and the table only. */
export const SERIES_OVERFLOW_COLOR = 'var(--chart-muted)';
