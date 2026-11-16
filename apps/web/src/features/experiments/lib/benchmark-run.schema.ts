import { z } from 'zod';

const count = z.int().nonnegative();
const positive = z.int().positive();
const amount = z.number().nonnegative();

/** Records come from other apps, so they are validated like any external input (ADR 007). */
const machineEnvironment = {
  platform: z.string(),
  arch: z.string(),
  cpuModel: z.string(),
  cpuCount: positive,
  totalMemoryBytes: positive,
  gitCommit: z.string().nullable(),
  gitDirty: z.boolean().nullable(),
};

const processMeasurements = {
  wallMs: amount,
  cpuUserMs: amount,
  cpuSystemMs: amount,
  peakRssBytes: amount,
};

const envelope = {
  version: z.literal(1),
  label: z.string().nullable(),
  startedAt: z.iso.datetime(),
};

export const importRunOptionsSchema = z.object({
  resolution: z.enum(['1k', '2k', '4k']),
  packConcurrency: positive,
  packInWorkers: z.boolean(),
  uploadConcurrency: positive,
  queueSize: positive,
  limit: positive.nullable(),
  ids: z.array(z.string()).nullable(),
});

const importRecordSchema = z.object({
  ...envelope,
  command: z.literal('import'),
  options: importRunOptionsSchema,
  environment: z.object({ node: z.string(), ...machineEnvironment }),
  measurements: z.object({
    ...processMeasurements,
    peakHeapUsedBytes: amount,
    peakArrayBuffersBytes: amount,
    eventLoopDelayMs: z.object({
      p50: amount,
      p99: amount,
      max: amount,
    }),
  }),
  result: z.object({
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
  }),
});

export const reindexRunOptionsSchema = z.object({
  batchSize: positive,
  /** 0 loads images in the main process. */
  numWorkers: count,
  prefetchFactor: positive,
  limit: positive.nullable(),
  includeEmbedded: z.boolean(),
  device: z.string(),
  model: z.string(),
});

const reindexRecordSchema = z.object({
  ...envelope,
  command: z.literal('reindex'),
  options: reindexRunOptionsSchema,
  environment: z.object({
    python: z.string(),
    torch: z.string(),
    ...machineEnvironment,
  }),
  measurements: z.object({
    ...processMeasurements,
    /** The largest single loader worker, not their sum. */
    peakWorkerRssBytes: amount,
  }),
  result: z.object({
    versionsListed: count,
    versionsAlreadyEmbedded: count,
    versionsWithoutImage: count,
    versionsSelected: count,
    versionsEmbedded: count,
    versionsSuperseded: count,
    imagesSelected: count,
    imagesEmbedded: count,
    batches: count,
    steadyImages: count,
    failures: z.array(
      z.object({
        assetId: z.string(),
        imageKey: z.string(),
        reason: z.string(),
      }),
    ),
    stages: z.object({
      listMs: amount,
      firstBatchMs: amount,
      loaderWaitMs: amount,
      modelMs: amount,
      writeMs: amount,
      shutdownMs: amount,
      steadyMs: amount,
      workerFetchMs: amount,
      workerDecodeMs: amount,
      workerPreprocessMs: amount,
    }),
    imagesPerSecond: amount,
    steadyImagesPerSecond: amount,
  }),
});

export const benchmarkRecordSchema = z.discriminatedUnion('command', [
  importRecordSchema,
  reindexRecordSchema,
]);

const benchmarkRunSchema = z.object({
  file: z.string(),
  record: benchmarkRecordSchema,
});

export const experimentSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  question: z.string().min(1),
  /** Absent while the experiment has no conclusion yet. */
  answer: z.string().min(1).optional(),
  report: z.string().regex(/^[a-z0-9-]+\.md$/),
  runs: z.array(z.string().regex(/\.json$/)).min(1),
});

export const experimentsManifestSchema = z.object({
  experiments: z.array(experimentSchema),
});

export const benchmarkBundleSchema = z.object({
  experiments: experimentsManifestSchema,
  runs: z.array(benchmarkRunSchema),
});

export type ImportRunOptions = z.infer<typeof importRunOptionsSchema>;
export type ReindexRunOptions = z.infer<typeof reindexRunOptionsSchema>;
export type ImportRecord = z.infer<typeof importRecordSchema>;
export type ReindexRecord = z.infer<typeof reindexRecordSchema>;
export type BenchmarkRecord = z.infer<typeof benchmarkRecordSchema>;
export type BenchmarkRun = z.infer<typeof benchmarkRunSchema>;
export type ExperimentDefinition = z.infer<typeof experimentSchema>;
export type BenchmarkBundle = z.infer<typeof benchmarkBundleSchema>;
