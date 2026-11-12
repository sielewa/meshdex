import {
  CONFIGURATION_OPTIONS,
  NUMERIC_CONFIGURATION_OPTIONS,
  WORKLOAD_OPTIONS,
} from '@/features/experiments/experiments.constants';
import type { BenchmarkRun } from '@/features/experiments/lib/benchmark-run.schema';
import type {
  ConfigurationField,
  Machine,
  NumericConfigurationOption,
  RunConfiguration,
  Workload,
} from '@/features/experiments/types/workload';

const RESOLUTION_ORDER = ['1k', '2k', '4k'];

/**
 * Groups runs into workloads (same command, same data, same machine) and, inside each, into
 * configurations (same options, Node.js version and commit). Derived from the records alone,
 * so a new experiment needs no list of which runs belong together: labels are only names.
 */
export function groupRuns(runs: readonly BenchmarkRun[]): Workload[] {
  const workloads = new Map<string, Workload>();
  const byTime = [...runs].sort((a, b) => a.record.startedAt.localeCompare(b.record.startedAt));

  for (const run of byTime) {
    const workload = getOrAdd(workloads, workloadKey(run), (key) => newWorkload(key, run));
    const configuration =
      workload.configurations.find((existing) => existing.key === configurationKey(run)) ??
      addConfiguration(workload, run);

    configuration.runs.push(run);

    if (run.record.label !== null && !configuration.labels.includes(run.record.label)) {
      configuration.labels.push(run.record.label);
    }
  }

  for (const workload of workloads.values()) {
    workload.differences = findDifferences(workload.configurations);

    const swept = sweptOption(workload);

    // A sweep reads along its option (1, 2, 4, 8 uploaders), not in recording order.
    if (swept !== null) {
      workload.configurations.sort((a, b) => a.options[swept] - b.options[swept]);
    }
  }

  return [...workloads.values()].sort(compareWorkloads);
}

/**
 * The numeric option a workload sweeps, when its configurations differ in that option alone
 * (same code, same other settings); `null` for any other comparison.
 */
export function sweptOption(workload: Workload): NumericConfigurationOption | null {
  const [only, ...rest] = workload.differences;

  return rest.length === 0 && only !== undefined && isNumericOption(only) ? only : null;
}

function isNumericOption(field: ConfigurationField): field is NumericConfigurationOption {
  return (NUMERIC_CONFIGURATION_OPTIONS as readonly string[]).includes(field);
}

function workloadKey({ record }: BenchmarkRun): string {
  const { options, environment } = record;

  return JSON.stringify([
    record.command,
    ...WORKLOAD_OPTIONS.map((name) => (name === 'ids' ? sortedIds(options.ids) : options[name])),
    environment.platform,
    environment.arch,
    environment.cpuModel,
    environment.cpuCount,
    environment.totalMemoryBytes,
  ]);
}

function configurationKey({ record }: BenchmarkRun): string {
  return JSON.stringify([
    ...CONFIGURATION_OPTIONS.map((name) => record.options[name]),
    record.environment.node,
    record.environment.gitCommit,
    record.environment.gitDirty,
  ]);
}

function newWorkload(key: string, { record }: BenchmarkRun): Workload {
  const { platform, arch, cpuModel, cpuCount, totalMemoryBytes } = record.environment;
  const machine: Machine = {
    platform,
    arch,
    cpuModel,
    cpuCount,
    totalMemoryBytes,
  };

  return {
    key,
    command: record.command,
    options: {
      resolution: record.options.resolution,
      limit: record.options.limit,
      ids: sortedIds(record.options.ids),
    },
    machine,
    configurations: [],
    differences: [],
  };
}

function addConfiguration(workload: Workload, run: BenchmarkRun): RunConfiguration {
  const { options, environment } = run.record;
  const configuration: RunConfiguration = {
    key: configurationKey(run),
    labels: [],
    options: {
      packConcurrency: options.packConcurrency,
      packInWorkers: options.packInWorkers,
      uploadConcurrency: options.uploadConcurrency,
      queueSize: options.queueSize,
    },
    node: environment.node,
    gitCommit: environment.gitCommit,
    gitDirty: environment.gitDirty,
    runs: [],
  };

  workload.configurations.push(configuration);

  return configuration;
}

/** A dirty tree counts as different code from its clean commit. */
function findDifferences(configurations: readonly RunConfiguration[]): ConfigurationField[] {
  const fields: Record<ConfigurationField, (configuration: RunConfiguration) => unknown> = {
    packConcurrency: (c) => c.options.packConcurrency,
    packInWorkers: (c) => c.options.packInWorkers,
    uploadConcurrency: (c) => c.options.uploadConcurrency,
    queueSize: (c) => c.options.queueSize,
    node: (c) => c.node,
    gitCommit: (c) => `${String(c.gitCommit)}:${String(c.gitDirty)}`,
  };

  return (Object.keys(fields) as ConfigurationField[]).filter(
    (field) => new Set(configurations.map(fields[field])).size > 1,
  );
}

/** By command, then resolution, then the number of models (all models last). */
function compareWorkloads(a: Workload, b: Workload): number {
  return (
    a.command.localeCompare(b.command) ||
    RESOLUTION_ORDER.indexOf(a.options.resolution) -
      RESOLUTION_ORDER.indexOf(b.options.resolution) ||
    (a.options.limit ?? Infinity) - (b.options.limit ?? Infinity) ||
    a.key.localeCompare(b.key)
  );
}

function sortedIds(ids: readonly string[] | null): string[] | null {
  return ids === null ? null : [...ids].sort();
}

function getOrAdd<V>(map: Map<string, V>, key: string, create: (key: string) => V): V {
  let value = map.get(key);

  if (value === undefined) {
    value = create(key);
    map.set(key, value);
  }

  return value;
}
