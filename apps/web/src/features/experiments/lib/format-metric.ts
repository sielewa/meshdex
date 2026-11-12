// Fixed locale: the same text on every server, whatever its settings.
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** "1,406", "83.0", "5.8": one decimal below 100, where it is still meaningful. */
export function formatMetricValue(value: number): string {
  return Math.abs(value) >= 100 ? whole.format(value) : oneDecimal.format(value);
}

/** Axis ticks are round numbers already: no padding with ".0". */
export function formatTick(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}
