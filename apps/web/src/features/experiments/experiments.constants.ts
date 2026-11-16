export const IMPORT_RESOLUTION_ORDER = ['1k', '2k', '4k'] as const;

/** SI, as ingest reports throughput. */
export const MEGABYTE = 1_000_000;

/** Validated against the card surface #171717 for colour-blind safety; never cycled. */
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
