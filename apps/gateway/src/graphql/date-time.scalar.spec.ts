import { Kind } from 'graphql';
import { DateTimeScalar } from './date-time.scalar';

describe('DateTimeScalar', () => {
  const scalar = new DateTimeScalar();

  it('serializes epoch milliseconds as an ISO 8601 UTC string', () => {
    expect(scalar.serialize(Date.UTC(2026, 10, 12, 9, 54, 33, 123))).toBe(
      '2026-11-12T09:54:33.123Z',
    );
  });

  it('refuses to serialize anything but integer milliseconds', () => {
    expect(() => scalar.serialize(new Date())).toThrow();
    expect(() => scalar.serialize(1.5)).toThrow();
  });

  it('parses ISO strings from variables and literals into milliseconds', () => {
    const expected = Date.UTC(2026, 10, 12, 9, 54, 33, 123);

    expect(scalar.parseValue('2026-11-12T09:54:33.123Z')).toBe(expected);
    expect(
      scalar.parseLiteral({
        kind: Kind.STRING,
        value: '2026-11-12T10:54:33.123+01:00',
      }),
    ).toBe(expected);
  });

  it('rejects input that is not a date', () => {
    expect(() => scalar.parseValue('yesterday')).toThrow();
    expect(() => scalar.parseValue(1_794_474_000_000)).toThrow();
    expect(() =>
      scalar.parseLiteral({
        kind: Kind.INT,
        value: '1',
      }),
    ).toThrow();
  });
});
