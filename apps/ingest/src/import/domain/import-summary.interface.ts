import type { ModelFailure } from './model-failure.interface';
import type { PipelineStats } from './pipeline-stats.interface';

export interface ImportSummary {
  /** Cached at the requested resolution and picked by `--ids` / `--limit`. */
  modelsSelected: number;
  modelsImported: number;
  /** Already in the state file from an earlier run; nothing was uploaded. */
  modelsAlreadyImported: number;
  failures: ModelFailure[];
  /** Size of the GLB files of the imported models. */
  bytesUploaded: number;
  pipeline: PipelineStats;
  durationMs: number;
}
