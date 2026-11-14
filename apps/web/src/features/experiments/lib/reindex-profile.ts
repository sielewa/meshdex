import { MEGABYTE } from '@/features/experiments/experiments.constants';
import type { ReindexRecord } from '@/features/experiments/lib/benchmark-run.schema';
import type { CommandProfile } from '@/features/experiments/types/run-profile';

/**
 * `ml_service reindex` runs. The data is the set of source previews it embeds: how many were
 * selected (the catalogue at the time, cut by `limit`) and whether already embedded ones were
 * included. The image count comes from the result, not the options: the same options on a
 * bigger catalogue are different work. How the work is done: batch size, loader workers,
 * prefetch depth, the device and the model.
 */
export const REINDEX_PROFILE: CommandProfile<ReindexRecord> = {
  work: ({ options, result }) => [options.limit, options.includeEmbedded, result.imagesSelected],

  workloadTitle: ({ options, result }) => {
    const images = `${String(result.imagesSelected)} images`;

    return options.includeEmbedded
      ? `Reindex · ${images} · already embedded included`
      : `Reindex · ${images}`;
  },

  workloadDetail: ({ result }) => `${String(result.imagesEmbedded)} images embedded per run`,

  workloadOrder: ({ options, result }) => [options.limit ?? Infinity, result.imagesSelected],

  settings: ({ options, environment }) => [
    {
      id: 'batchSize',
      name: 'batch size',
      value: options.batchSize,
      text: `batch ${String(options.batchSize)}`,
      kind: 'option',
    },
    {
      id: 'numWorkers',
      name: 'loader workers',
      value: options.numWorkers,
      text:
        options.numWorkers === 0
          ? 'loading in the main process'
          : `${String(options.numWorkers)} workers`,
      kind: 'option',
    },
    {
      id: 'prefetchFactor',
      name: 'prefetch factor',
      value: options.prefetchFactor,
      text: `prefetch ${String(options.prefetchFactor)}`,
      kind: 'option',
    },
    {
      id: 'device',
      name: 'device',
      value: options.device,
      text: options.device,
      kind: 'option',
    },
    {
      id: 'model',
      name: 'model',
      value: options.model,
      text: options.model,
      kind: 'option',
    },
    {
      id: 'python',
      name: 'Python version',
      value: environment.python,
      text: `Python ${environment.python}`,
      kind: 'runtime',
    },
    {
      id: 'torch',
      name: 'PyTorch version',
      value: environment.torch,
      text: `torch ${environment.torch}`,
      kind: 'runtime',
    },
  ],

  // Main-process stages first (they add up to the wall time), then the costs of the process.
  metrics: [
    {
      id: 'wall-time',
      label: 'Wall time',
      unit: 'ms',
      better: 'lower',
      description: 'The reindex itself, from listing to shutdown; loading the model is excluded.',
      value: (record) => record.measurements.wallMs,
    },
    {
      id: 'steady-throughput',
      label: 'Steady throughput',
      unit: 'img/s',
      better: 'higher',
      description:
        'Images per second after the first batch and before shutdown: what a much larger catalogue would see.',
      value: (record) => record.result.steadyImagesPerSecond,
    },
    {
      id: 'first-batch',
      label: 'Start-up',
      unit: 'ms',
      better: 'lower',
      description: 'Until the first batch arrived: starting the workers plus one batch of loading.',
      value: (record) => record.result.stages.firstBatchMs,
    },
    {
      id: 'loader-wait',
      label: 'Loader wait',
      unit: 'ms',
      better: 'lower',
      description:
        'Time the model waited for later batches: long means loading cannot keep up with the model.',
      value: (record) => record.result.stages.loaderWaitMs,
    },
    {
      id: 'model-time',
      label: 'Model time',
      unit: 'ms',
      better: 'lower',
      description: 'Embedding every batch on the device, transfer included.',
      value: (record) => record.result.stages.modelMs,
    },
    {
      id: 'write-time',
      label: 'Database writes',
      unit: 'ms',
      better: 'lower',
      description: 'Storing the embeddings, one transaction per batch.',
      value: (record) => record.result.stages.writeMs,
    },
    {
      id: 'shutdown',
      label: 'Shutdown',
      unit: 'ms',
      better: 'lower',
      description: 'Stopping the loader workers after the last batch.',
      value: (record) => record.result.stages.shutdownMs,
    },
    {
      id: 'cpu-time',
      label: 'CPU time',
      unit: 'ms',
      better: 'lower',
      description:
        'User plus system time of the process and its loader workers, model loading included.',
      value: (record) => record.measurements.cpuUserMs + record.measurements.cpuSystemMs,
    },
    {
      id: 'peak-rss',
      label: 'Peak RSS',
      unit: 'MB',
      better: 'lower',
      description: 'Highest resident memory of the main process, the model included.',
      value: (record) => record.measurements.peakRssBytes / MEGABYTE,
    },
  ],
};
