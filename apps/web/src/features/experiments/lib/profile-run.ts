import type { BenchmarkRecord } from '@/features/experiments/lib/benchmark-run.schema';
import { describeCommit } from '@/features/experiments/lib/describe-runs';
import { IMPORT_PROFILE } from '@/features/experiments/lib/import-profile';
import { REINDEX_PROFILE } from '@/features/experiments/lib/reindex-profile';
import type { CommandProfile, RunProfile } from '@/features/experiments/types/run-profile';

/** Narrowing on `command` types each profile with its own record format. */
export function profileRun(record: BenchmarkRecord): RunProfile {
  switch (record.command) {
    case 'import':
      return applyProfile(IMPORT_PROFILE, record);
    case 'reindex':
      return applyProfile(REINDEX_PROFILE, record);
  }
}

function applyProfile<R extends BenchmarkRecord>(
  profile: CommandProfile<R>,
  record: R,
): RunProfile {
  const { platform, arch, cpuModel, cpuCount, totalMemoryBytes, gitCommit, gitDirty } =
    record.environment;

  return {
    command: record.command,
    work: profile.work(record),
    workloadTitle: profile.workloadTitle(record),
    workloadDetail: profile.workloadDetail(record),
    workloadOrder: profile.workloadOrder(record),
    machine: {
      platform,
      arch,
      cpuModel,
      cpuCount,
      totalMemoryBytes,
    },
    settings: [
      ...profile.settings(record),
      // A dirty tree counts as different code from its clean commit.
      {
        id: 'gitCommit',
        name: 'code version',
        value: `${String(gitCommit)}:${String(gitDirty)}`,
        text: describeCommit({ gitCommit, gitDirty }),
        kind: 'code',
      },
    ],
    gitCommit,
    gitDirty,
    metrics: profile.metrics.map(({ id, label, unit, better, description }) => ({
      id,
      label,
      unit,
      better,
      description,
    })),
    values: Object.fromEntries(profile.metrics.map((metric) => [metric.id, metric.value(record)])),
  };
}
