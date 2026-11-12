/**
 * Import options that choose the data a run works on. Runs with equal values (on the same
 * machine) did the same work, so they can be compared.
 */
export const WORKLOAD_OPTIONS = ['resolution', 'limit', 'ids'] as const;

/**
 * Import options that change how the same work is done: what an experiment varies. Together
 * with the Node.js version and the commit they tell configurations apart.
 */
export const CONFIGURATION_OPTIONS = [
  'packConcurrency',
  'packInWorkers',
  'uploadConcurrency',
  'queueSize',
] as const;
