import type { ModelPacker } from './model-packer.interface';

/** A `ModelPacker` backed by worker threads, which must be closed after the run. */
export interface PackerPool extends ModelPacker {
  close(): Promise<void>;
}
