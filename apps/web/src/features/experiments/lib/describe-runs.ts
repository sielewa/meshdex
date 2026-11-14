import type { RunConfiguration, Workload } from '@/features/experiments/types/workload';
import { formatBytes } from '@/lib/format-bytes';

/** "Apple M4 · 10 cores · 34.4 GB RAM · darwin/arm64". */
export function describeMachine({ machine }: Workload): string {
  return [
    machine.cpuModel,
    `${String(machine.cpuCount)} cores`,
    `${formatBytes(machine.totalMemoryBytes)} RAM`,
    `${machine.platform}/${machine.arch}`,
  ].join(' · ');
}

/** "where packing runs, code version": what the given settings of a workload are. */
export function describeDifferences(workload: Workload, ids: readonly string[]): string {
  const settings = workload.configurations[0]?.settings ?? [];

  return ids.map((id) => settings.find((setting) => setting.id === id)?.name ?? id).join(', ');
}

/**
 * Names a configuration by the given settings ("worker threads"), so the legend says what is
 * being compared rather than repeating settings that are the same everywhere. With no ids, a
 * lone configuration is described by all its options; runtime and code only matter when they
 * differ, and then they are among the ids.
 */
export function describeConfiguration(
  configuration: RunConfiguration,
  ids: readonly string[],
): string {
  const settings =
    ids.length > 0
      ? configuration.settings.filter((setting) => ids.includes(setting.id))
      : configuration.settings.filter((setting) => setting.kind === 'option');

  return settings.map((setting) => setting.text).join(' · ');
}

/** "1c22834", "1c22834 + changes" for a dirty tree, "unknown code" outside a checkout. */
export function describeCommit({
  gitCommit,
  gitDirty,
}: Pick<RunConfiguration, 'gitCommit' | 'gitDirty'>): string {
  if (gitCommit === null) {
    return 'unknown code';
  }

  return gitDirty === true ? `${gitCommit.slice(0, 7)} + changes` : gitCommit.slice(0, 7);
}
