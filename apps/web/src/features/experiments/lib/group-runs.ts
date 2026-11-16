import type { BenchmarkRun } from '@/features/experiments/lib/benchmark-run.schema';
import { profileRun } from '@/features/experiments/lib/profile-run';
import type { RunProfile, RunSetting } from '@/features/experiments/types/run-profile';
import type { RunConfiguration, Workload } from '@/features/experiments/types/workload';

/**
 * Workloads (same command, data and machine) split into configurations (same settings and
 * commit), derived from the records alone: labels are only names.
 */
export function groupRuns(runs: readonly BenchmarkRun[]): Workload[] {
  const workloads = new Map<string, Workload>();
  const byTime = [...runs].sort((a, b) => a.record.startedAt.localeCompare(b.record.startedAt));

  for (const run of byTime) {
    const profile = profileRun(run.record);
    const workload = getOrAdd(workloads, workloadKey(profile), (key) => newWorkload(key, profile));
    const key = configurationKey(profile);
    const configuration =
      workload.configurations.find((existing) => existing.key === key) ??
      addConfiguration(workload, key, profile);

    configuration.runs.push({
      file: run.file,
      startedAt: run.record.startedAt,
      values: profile.values,
    });

    if (run.record.label !== null && !configuration.labels.includes(run.record.label)) {
      configuration.labels.push(run.record.label);
    }
  }

  for (const workload of workloads.values()) {
    workload.differences = findDifferences(workload.configurations);

    const swept = sweptSetting(workload);

    // A sweep reads along its setting (1, 2, 4, 8 uploaders), not in recording order.
    if (swept !== null) {
      workload.configurations.sort(
        (a, b) => Number(findSetting(a, swept)?.value) - Number(findSetting(b, swept)?.value),
      );
    }
  }

  return [...workloads.values()].sort(compareWorkloads);
}

/** Set only when the configurations differ in that one numeric option. */
export function sweptSetting(workload: Workload): string | null {
  const [only, ...rest] = workload.differences;

  if (only === undefined || rest.length > 0) {
    return null;
  }

  const numericOption = workload.configurations.every((configuration) => {
    const setting = findSetting(configuration, only);

    return setting?.kind === 'option' && typeof setting.value === 'number';
  });

  return numericOption ? only : null;
}

export function findSetting(configuration: RunConfiguration, id: string): RunSetting | undefined {
  return configuration.settings.find((setting) => setting.id === id);
}

function workloadKey({ command, work, machine }: RunProfile): string {
  return JSON.stringify([
    command,
    work,
    machine.platform,
    machine.arch,
    machine.cpuModel,
    machine.cpuCount,
    machine.totalMemoryBytes,
  ]);
}

function configurationKey({ settings }: RunProfile): string {
  return JSON.stringify(settings.map((setting) => [setting.id, setting.value]));
}

function newWorkload(key: string, profile: RunProfile): Workload {
  return {
    key,
    command: profile.command,
    title: profile.workloadTitle,
    detail: profile.workloadDetail,
    order: profile.workloadOrder,
    machine: profile.machine,
    metrics: profile.metrics,
    configurations: [],
    differences: [],
  };
}

function addConfiguration(workload: Workload, key: string, profile: RunProfile): RunConfiguration {
  const configuration: RunConfiguration = {
    key,
    labels: [],
    settings: profile.settings,
    gitCommit: profile.gitCommit,
    gitDirty: profile.gitDirty,
    runs: [],
  };

  workload.configurations.push(configuration);

  return configuration;
}

function findDifferences(configurations: readonly RunConfiguration[]): string[] {
  const ids = configurations[0]?.settings.map((setting) => setting.id) ?? [];

  return ids.filter((id) => new Set(configurations.map((c) => findSetting(c, id)?.value)).size > 1);
}

function compareWorkloads(a: Workload, b: Workload): number {
  return (
    a.command.localeCompare(b.command) ||
    compareOrder(a.order, b.order) ||
    a.key.localeCompare(b.key)
  );
}

function compareOrder(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);

    // Infinity - Infinity is NaN: two "all models" workloads are equal at this position.
    if (difference !== 0 && !Number.isNaN(difference)) {
      return difference;
    }
  }

  return a.length - b.length;
}

function getOrAdd<V>(map: Map<string, V>, key: string, create: (key: string) => V): V {
  let value = map.get(key);

  if (value === undefined) {
    value = create(key);
    map.set(key, value);
  }

  return value;
}
