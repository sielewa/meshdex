import type {
  ConfigurationField,
  RunConfiguration,
  Workload,
} from '@/features/experiments/types/workload';
import { formatBytes } from '@/lib/format-bytes';

const FIELD_NAMES: Record<ConfigurationField, string> = {
  packConcurrency: 'packers',
  packInWorkers: 'where packing runs',
  uploadConcurrency: 'uploaders',
  queueSize: 'queue size',
  node: 'Node.js version',
  gitCommit: 'code version',
};

const FIELD_ORDER = Object.keys(FIELD_NAMES) as ConfigurationField[];

/** "Import · 1k textures · first 50 models". */
export function describeWorkload({ command, options }: Workload): string {
  const models =
    options.ids !== null
      ? `${String(options.ids.length)} chosen models`
      : options.limit !== null
        ? `first ${String(options.limit)} models`
        : 'all cached models';
  const name = command.charAt(0).toUpperCase() + command.slice(1);

  return `${name} · ${options.resolution} textures · ${models}`;
}

/** "Apple M4 · 10 cores · 34.4 GB RAM · darwin/arm64". */
export function describeMachine({ machine }: Workload): string {
  return [
    machine.cpuModel,
    `${String(machine.cpuCount)} cores`,
    `${formatBytes(machine.totalMemoryBytes)} RAM`,
    `${machine.platform}/${machine.arch}`,
  ].join(' · ');
}

/** "where packing runs", or "all options" when a workload has a single configuration. */
export function describeDifferences(fields: readonly ConfigurationField[]): string {
  return fields.map((field) => FIELD_NAMES[field]).join(', ');
}

/**
 * Names a configuration by what sets it apart from the others in its workload ("worker
 * threads"), so the legend says what is being compared rather than repeating settings that
 * are the same everywhere. A lone configuration is described in full.
 */
export function describeConfiguration(
  configuration: RunConfiguration,
  differences: readonly ConfigurationField[],
): string {
  const fields =
    differences.length > 0
      ? differences
      : FIELD_ORDER.filter((field) => field !== 'node' && field !== 'gitCommit');

  return fields.map((field) => describeField(configuration, field)).join(' · ');
}

/** "2 packers · queue 4 · 4 uploaders · main thread": every option of a configuration. */
export function describeSettings(configuration: RunConfiguration): string {
  return describeConfiguration(configuration, []);
}

function describeField(configuration: RunConfiguration, field: ConfigurationField): string {
  const { options } = configuration;

  switch (field) {
    case 'packConcurrency':
      return `${String(options.packConcurrency)} packers`;
    case 'packInWorkers':
      return options.packInWorkers ? 'worker threads' : 'main thread';
    case 'uploadConcurrency':
      return `${String(options.uploadConcurrency)} uploaders`;
    case 'queueSize':
      return `queue ${String(options.queueSize)}`;
    case 'node':
      return `Node ${configuration.node}`;
    case 'gitCommit':
      return describeCommit(configuration);
  }
}

/** "1c22834", "1c22834 + changes" for a dirty tree, "unknown code" outside a checkout. */
export function describeCommit({ gitCommit, gitDirty }: RunConfiguration): string {
  if (gitCommit === null) {
    return 'unknown code';
  }

  return gitDirty === true ? `${gitCommit.slice(0, 7)} + changes` : gitCommit.slice(0, 7);
}
