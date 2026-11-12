import type { ProcessingOutputs } from './processing-outputs.interface';

/** What the processing worker reports: exactly one of the two (mirrors the proto `oneof`). */
export type ProcessingOutcome =
  { kind: 'succeeded'; outputs: ProcessingOutputs } | { kind: 'failed'; reason: string };
