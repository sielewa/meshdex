const UNITS = ['B', 'kB', 'MB', 'GB', 'TB'] as const;
const STEP = 1000;

/**
 * Human-readable size with SI units (1 MB = 1 000 000 B), the way macOS Finder shows it.
 * Deterministic for a given input, so server and client render the same text (no
 * hydration mismatch).
 */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;

  while (value >= STEP && unit < UNITS.length - 1) {
    value /= STEP;
    unit += 1;
  }

  const digits = unit === 0 || value >= 100 ? 0 : 1;

  return `${value.toFixed(digits)} ${UNITS[unit] ?? 'B'}`;
}
