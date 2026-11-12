import { z } from 'zod';

const count = z.int().nonnegative();
const positive = z.int().positive();
const amount = z.number().nonnegative();

/**
 * Options of `ingest import` that shape a measurement (`ImportRunOptions` in ingest). Records
 * come from another app, so they are validated like any external input (ADR 007), not trusted
 * as a hand-written type.
 */
export const importRunOptionsSchema = z.object({
  resolution: z.enum(['1k', '2k', '4k']),
  packConcurrency: positive,
  packInWorkers: z.boolean(),
  uploadConcurrency: positive,
  queueSize: positive,
  limit: positive.nullable(),
  ids: z.array(z.string()).nullable(),
});

const runEnvironmentSchema = z.object({
  node: z.string(),
  platform: z.string(),
  arch: z.string(),
  cpuModel: z.string(),
  cpuCount: positive,
  totalMemoryBytes: positive,
  gitCommit: z.string().nullable(),
  gitDirty: z.boolean().nullable(),
});

const runMeasurementsSchema = z.object({
  wallMs: amount,
  cpuUserMs: amount,
  cpuSystemMs: amount,
  peakRssBytes: amount,
  peakHeapUsedBytes: amount,
  peakArrayBuffersBytes: amount,
  eventLoopDelayMs: z.object({
    p50: amount,
    p99: amount,
    max: amount,
  }),
});

const importRunResultSchema = z.object({
  modelsSelected: count,
  modelsImported: count,
  modelsAlreadyImported: count,
  failures: z.array(z.object({ modelId: z.string(), reason: z.string() })),
  bytesUploaded: count,
  pipeline: z.object({
    packBusyMs: amount,
    uploadBusyMs: amount,
    packerBlockedMs: amount,
    uploaderIdleMs: amount,
    maxQueued: count,
  }),
  modelsPerSecond: amount,
  megabytesPerSecond: amount,
});

/**
 * One recorded run (format version 1, `RunRecord` in ingest). Only `import` records exist so
 * far; another command becomes another member of a discriminated union on `command`.
 */
export const benchmarkRecordSchema = z.object({
  version: z.literal(1),
  command: z.literal('import'),
  label: z.string().nullable(),
  startedAt: z.iso.datetime(),
  options: importRunOptionsSchema,
  environment: runEnvironmentSchema,
  measurements: runMeasurementsSchema,
  result: importRunResultSchema,
});

const benchmarkRunSchema = z.object({
  file: z.string(),
  record: benchmarkRecordSchema,
});

/** One question and the runs recorded to answer it (`docs/benchmarks/experiments.json`, ADR 016). */
export const experimentSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  question: z.string().min(1),
  /** One sentence; absent while the experiment has no conclusion yet. */
  answer: z.string().min(1).optional(),
  /** File name of the report in `docs/benchmarks/`. */
  report: z.string().regex(/^[a-z0-9-]+\.md$/),
  runs: z.array(z.string().regex(/\.json$/)).min(1),
});

export const experimentsManifestSchema = z.object({
  experiments: z.array(experimentSchema),
});

/** The bundle written by `scripts/collect-benchmark-runs.ts`. */
export const benchmarkBundleSchema = z.object({
  experiments: experimentsManifestSchema,
  runs: z.array(benchmarkRunSchema),
});

export type ImportRunOptions = z.infer<typeof importRunOptionsSchema>;
export type BenchmarkRecord = z.infer<typeof benchmarkRecordSchema>;
export type BenchmarkRun = z.infer<typeof benchmarkRunSchema>;
export type ExperimentDefinition = z.infer<typeof experimentSchema>;
export type BenchmarkBundle = z.infer<typeof benchmarkBundleSchema>;
