import { describe, expect, it } from 'vitest';
import { niceScale } from '@/features/experiments/lib/nice-scale';

describe('niceScale', () => {
  it('starts at zero and ends on a round tick at or above the largest value', () => {
    expect(niceScale(997)).toEqual({ max: 1000, ticks: [0, 250, 500, 750, 1000] });
  });

  it('uses steps of 1, 2, 2.5 or 5 times a power of ten', () => {
    expect(niceScale(1428).ticks).toEqual([0, 500, 1000, 1500]);
    expect(niceScale(134).ticks).toEqual([0, 50, 100, 150]);
    expect(niceScale(7.4).ticks).toEqual([0, 2, 4, 6, 8]);
  });

  it('keeps fractional ticks free of float noise', () => {
    expect(niceScale(0.7).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
  });

  it('falls back to a unit domain when there is nothing to show', () => {
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] });
  });
});
