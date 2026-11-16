import type { ProtoTimestamp } from './proto-timestamp.interface';
import { MS_PER_SECOND, NANOS_PER_MS } from './time.constants';

/** `Math.floor` keeps `nanos` non-negative before 1970, as the proto spec requires. */
export function toProtoTimestamp(epochMs: number): ProtoTimestamp {
  if (!Number.isSafeInteger(epochMs)) {
    throw new RangeError(`Expected integer epoch milliseconds, got ${String(epochMs)}`);
  }

  const seconds = Math.floor(epochMs / MS_PER_SECOND);
  const remainderMs = epochMs - seconds * MS_PER_SECOND;

  return {
    seconds,
    nanos: remainderMs * NANOS_PER_MS,
  };
}

/** Precision below 1 ms is dropped. */
export function fromProtoTimestamp(timestamp: ProtoTimestamp): number {
  return timestamp.seconds * MS_PER_SECOND + Math.floor(timestamp.nanos / NANOS_PER_MS);
}
