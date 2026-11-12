import 'reflect-metadata';
import { ConfigValidationException, validateConfig } from '@meshdex/shared';
import { ImportArgs } from './import.args';

const valid = {
  resolution: '1k',
  packConcurrency: '2',
  uploadConcurrency: '4',
  queueSize: '4',
};

describe('ImportArgs', () => {
  it('converts the command-line strings', () => {
    const args = validateConfig(ImportArgs, {
      ...valid,
      limit: '5',
      ids: ['ArmChair_01'],
      state: 'runs/state.jsonl',
      record: 'runs',
      label: 'queue-16',
    });

    expect(args).toMatchObject({
      packConcurrency: 2,
      uploadConcurrency: 4,
      queueSize: 4,
      limit: 5,
    });
  });

  it.each([
    ['pack concurrency above the cap', { packConcurrency: '9' }],
    ['upload concurrency of zero', { uploadConcurrency: '0' }],
    ['a queue above the cap', { queueSize: '33' }],
    ['an empty state path', { state: '' }],
    ['an id that is a path', { ids: ['../etc'] }],
    ['a label that is not a file-name slug', { label: '../Baseline run' }],
  ])('rejects %s', (_case, override) => {
    expect(() => validateConfig(ImportArgs, { ...valid, ...override })).toThrow(
      ConfigValidationException,
    );
  });
});
