import 'reflect-metadata';
import { ConfigValidationException, validateConfig } from '@meshdex/shared';
import { FetchArgs } from './fetch.args';

describe('FetchArgs', () => {
  it('converts the command-line strings', () => {
    const args = validateConfig(FetchArgs, {
      resolution: '2k',
      concurrency: '3',
      limit: '10',
      ids: ['ArmChair_01'],
    });

    expect(args.concurrency).toBe(3);
    expect(args.limit).toBe(10);
  });

  it.each([
    ['an unknown resolution', { resolution: '8k' }],
    ['concurrency above the cap', { concurrency: '5' }],
    ['a zero limit', { limit: '0' }],
    ['an id that is a path', { ids: ['../etc'] }],
  ])('rejects %s', (_case, override) => {
    expect(() =>
      validateConfig(FetchArgs, {
        resolution: '1k',
        concurrency: '2',
        ...override,
      }),
    ).toThrow(ConfigValidationException);
  });
});
