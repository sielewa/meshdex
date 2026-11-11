import { InvalidUploadRequestException } from '../exceptions/invalid-upload-request.exception';
import { normalizeTagNames } from './tag-names';

describe('normalizeTagNames', () => {
  it('trims, lower-cases and joins inner whitespace with dashes', () => {
    expect(normalizeTagNames(['  Wooden  Chair ', 'LOW poly'])).toEqual([
      'wooden-chair',
      'low-poly',
    ]);
  });

  it('drops empty names and duplicates while keeping input order', () => {
    expect(normalizeTagNames(['chair', ' ', 'Chair', 'table'])).toEqual(['chair', 'table']);
  });

  it('rejects names longer than the limit', () => {
    expect(() => normalizeTagNames(['x'.repeat(51)])).toThrow(InvalidUploadRequestException);
  });

  it('rejects more than 20 distinct tags', () => {
    const tags = Array.from({ length: 21 }, (_, index) => `tag-${String(index)}`);

    expect(() => normalizeTagNames(tags)).toThrow(InvalidUploadRequestException);
  });
});
