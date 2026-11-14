/** Texture resolutions of `ingest import`, smallest first: the order of its workloads. */
export const IMPORT_RESOLUTION_ORDER = ['1k', '2k', '4k'] as const;

/** SI megabytes, the unit ingest reports throughput in (and `formatBytes` uses). */
export const MEGABYTE = 1_000_000;

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
