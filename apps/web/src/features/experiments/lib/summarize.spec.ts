import { describe, expect, it } from 'vitest';
import { summarize } from '@/features/experiments/lib/summarize';

describe('summarize', () => {
  it('takes the middle value of an odd count, whatever the order', () => {
    expect(summarize([900, 600, 1000, 700, 800])).toEqual({
      n: 5,
      median: 800,
      min: 600,
      max: 1000,
    });
  });

  it('averages the two middle values of an even count', () => {
    expect(summarize([4, 1, 3, 2]).median).toBe(2.5);
  });

  it('is not pulled by one outlier', () => {
    expect(summarize([10, 11, 12, 13, 500]).median).toBe(12);
  });

  it('refuses an empty list', () => {
    expect(() => summarize([])).toThrow(RangeError);
  });
});
