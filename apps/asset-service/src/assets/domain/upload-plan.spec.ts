import { InvalidUploadRequestException } from '../exceptions/invalid-upload-request.exception';
import { countParts, resolvePartNumbers, validateCompletedParts } from './upload-plan';

const MIB = 1024 * 1024;

describe('upload plan', () => {
  it('counts parts with a smaller last part', () => {
    expect(countParts(16 * MIB, 16 * MIB)).toBe(1);
    expect(countParts(16 * MIB + 1, 16 * MIB)).toBe(2);
    expect(countParts(512 * MIB, 16 * MIB)).toBe(32);
  });

  it('sorts completed parts by number', () => {
    const parts = validateCompletedParts(
      [
        { partNumber: 2, etag: '"b"' },
        { partNumber: 1, etag: '"a"' },
      ],
      2,
    );

    expect(parts.map((part) => part.partNumber)).toEqual([1, 2]);
  });

  it('rejects missing, duplicated or unsigned parts', () => {
    expect(() => validateCompletedParts([{ partNumber: 1, etag: '"a"' }], 2)).toThrow(
      InvalidUploadRequestException,
    );
    expect(() =>
      validateCompletedParts(
        [
          { partNumber: 1, etag: '"a"' },
          { partNumber: 1, etag: '"a"' },
        ],
        2,
      ),
    ).toThrow(InvalidUploadRequestException);
    expect(() => validateCompletedParts([{ partNumber: 1, etag: '' }], 1)).toThrow(
      InvalidUploadRequestException,
    );
  });

  it('resolves an empty part list to all parts and validates explicit ones', () => {
    expect(resolvePartNumbers([], 3)).toEqual([1, 2, 3]);
    expect(resolvePartNumbers([2, 2, 3], 3)).toEqual([2, 3]);
    expect(() => resolvePartNumbers([4], 3)).toThrow(InvalidUploadRequestException);
  });
});
