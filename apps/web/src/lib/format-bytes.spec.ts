import { describe, expect, it } from 'vitest';
import { formatBytes } from './format-bytes';

describe('formatBytes', () => {
  it('uses SI units with one decimal below 100', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(20_971_520)).toBe('21.0 MB');
    expect(formatBytes(5_000_000_000)).toBe('5.0 GB');
  });

  it('drops decimals for three-digit values', () => {
    expect(formatBytes(123_456_789)).toBe('123 MB');
  });
});
