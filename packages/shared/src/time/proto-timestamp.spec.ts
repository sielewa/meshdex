import { fromProtoTimestamp, toProtoTimestamp } from './proto-timestamp';

describe('proto timestamp conversion', () => {
  it('splits epoch milliseconds into seconds and nanos', () => {
    expect(toProtoTimestamp(1_762_900_000_123)).toEqual({
      seconds: 1_762_900_000,
      nanos: 123_000_000,
    });
  });

  it('keeps nanos non-negative for instants before the epoch', () => {
    expect(toProtoTimestamp(-1)).toEqual({
      seconds: -1,
      nanos: 999_000_000,
    });
  });

  it('round-trips milliseconds without loss', () => {
    for (const epochMs of [0, 1, 999, 1000, -1, -1001, 1_762_900_000_123]) {
      expect(fromProtoTimestamp(toProtoTimestamp(epochMs))).toBe(epochMs);
    }
  });

  it('drops precision below one millisecond', () => {
    expect(
      fromProtoTimestamp({
        seconds: 10,
        nanos: 1_999_999,
      }),
    ).toBe(10_001);
  });

  it('rejects values that are not integer milliseconds', () => {
    expect(() => toProtoTimestamp(1.5)).toThrow(RangeError);
    expect(() => toProtoTimestamp(Number.NaN)).toThrow(RangeError);
  });
});
