import type { ProcessingOutputs } from './processing-outputs.interface';

export type ProcessingOutcome =
  { kind: 'succeeded'; outputs: ProcessingOutputs } | { kind: 'failed'; reason: string };
