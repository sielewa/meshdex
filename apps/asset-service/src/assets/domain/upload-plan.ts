import type { UploadedPart } from '../../storage/domain/object-storage-port.interface';
import { InvalidUploadRequestException } from '../exceptions/invalid-upload-request.exception';

/** Number of parts for a file: every part has `partSizeBytes` except the (smaller) last one. */
export function countParts(sizeBytes: number, partSizeBytes: number): number {
  return Math.ceil(sizeBytes / partSizeBytes);
}

/** Object key of an uploaded original; the version id keeps versions of one asset apart. */
export function originalObjectKey(assetId: string, versionId: string): string {
  return `originals/${assetId}/${versionId}.glb`;
}

/**
 * Checks that the client reports every part exactly once and returns them sorted,
 * as CompleteMultipartUpload requires ascending part numbers.
 */
export function validateCompletedParts(parts: UploadedPart[], partCount: number): UploadedPart[] {
  const sorted = [...parts].sort((left, right) => left.partNumber - right.partNumber);
  const complete =
    sorted.length === partCount &&
    sorted.every((part, index) => part.partNumber === index + 1 && part.etag.length > 0);

  if (!complete) {
    throw new InvalidUploadRequestException(
      `Expected parts 1..${String(partCount)} each with an ETag, got ${String(parts.length)}`,
    );
  }

  return sorted;
}

/** Validates requested part numbers; an empty list means "all parts". */
export function resolvePartNumbers(requested: number[], partCount: number): number[] {
  if (requested.length === 0) {
    return Array.from({ length: partCount }, (_, index) => index + 1);
  }

  const invalid = requested.find(
    (partNumber) => !Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount,
  );

  if (invalid !== undefined) {
    throw new InvalidUploadRequestException(
      `Part number ${String(invalid)} is outside 1..${String(partCount)}`,
    );
  }

  return [...new Set(requested)];
}
