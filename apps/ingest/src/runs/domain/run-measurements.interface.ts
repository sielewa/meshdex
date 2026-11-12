import type { EventLoopDelay } from './event-loop-delay.interface';

/** What the process spent on one run, measured by `RunProbe`. */
export interface RunMeasurements {
  wallMs: number;
  /** CPU time of the whole process (all threads), so it can exceed `wallMs`. */
  cpuUserMs: number;
  cpuSystemMs: number;
  /** Highest values seen in samples taken every `MEMORY_SAMPLE_INTERVAL_MS`. */
  peakRssBytes: number;
  peakHeapUsedBytes: number;
  /** Memory of ArrayBuffers (outside the JS heap): where the packed GLBs live. */
  peakArrayBuffersBytes: number;
  eventLoopDelayMs: EventLoopDelay;
}
