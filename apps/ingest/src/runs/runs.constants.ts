/** Bumped when a field of the run record changes meaning or is removed. */
export const RUN_RECORD_VERSION = 1;

/** How often memory is sampled during a run; peaks shorter than this can be missed. */
export const MEMORY_SAMPLE_INTERVAL_MS = 20;

/**
 * Timer resolution of the event-loop delay histogram. Packing blocks the loop for single
 * milliseconds, so the finest resolution Node allows is used.
 */
export const EVENT_LOOP_RESOLUTION_MS = 1;

/** Run labels become part of the file name. */
export const RUN_LABEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Reading the commit must never hold up a run. */
export const GIT_TIMEOUT_MS = 2_000;
