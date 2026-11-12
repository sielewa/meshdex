/** A zero-based linear scale whose ticks are round numbers. */
export interface NiceScale {
  /** Top of the domain: the last tick, at or above the largest value. */
  max: number;
  ticks: number[];
}

const STEP_MULTIPLIERS = [1, 2, 2.5, 5, 10];

/**
 * Zero-based on purpose: the charts compare magnitudes ("20 % slower"), and an axis that
 * starts near the smallest value would make a small difference look like a large one.
 * The step is 1, 2, 2.5 or 5 times a power of ten, so ticks read as 0 / 250 / 500 / 750.
 */
export function niceScale(largestValue: number, targetTickCount = 4): NiceScale {
  if (!Number.isFinite(largestValue) || largestValue <= 0) {
    return { max: 1, ticks: [0, 1] };
  }

  const roughStep = largestValue / targetTickCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const multiplier = STEP_MULTIPLIERS.find((candidate) => candidate * magnitude >= roughStep) ?? 10;
  const step = multiplier * magnitude;
  const tickCount = Math.ceil(largestValue / step);
  // Multiplying instead of adding the step keeps float error from piling up (0.1 + 0.2).
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) =>
    roundToStep(index * step, step),
  );

  return { max: ticks[ticks.length - 1] ?? largestValue, ticks };
}

function roundToStep(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);

  return Number(value.toFixed(decimals));
}
