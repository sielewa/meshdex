import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { EventLoopDelay } from './domain/event-loop-delay.interface';
import type { RunMeasurements } from './domain/run-measurements.interface';
import { EVENT_LOOP_RESOLUTION_MS, MEMORY_SAMPLE_INTERVAL_MS } from './runs.constants';

/**
 * Measures one run from construction to `stop()`: wall and CPU time, memory peaks and
 * event-loop delay.
 *
 * Event-loop delay is how late a 1 ms timer fires: while synchronous work (JSON parsing,
 * buffer copies in the packer) runs on the main thread, nothing else can, including the
 * callbacks that keep uploads moving. The histogram reports the full interval between ticks,
 * so the resolution is subtracted to leave only the delay.
 *
 * Memory is sampled on a timer, so a peak between two samples can be missed; the timer is
 * `unref`'d so it never keeps the process alive.
 */
export class RunProbe {
  private readonly startedAt = performance.now();
  private readonly cpuAtStart = process.cpuUsage();
  private readonly histogram = monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS });
  private readonly sampler: NodeJS.Timeout;
  private peakRssBytes = 0;
  private peakHeapUsedBytes = 0;
  private peakArrayBuffersBytes = 0;

  constructor() {
    this.histogram.enable();
    this.sample();
    this.sampler = setInterval(() => {
      this.sample();
    }, MEMORY_SAMPLE_INTERVAL_MS);
    this.sampler.unref();
  }

  stop(): RunMeasurements {
    const wallMs = performance.now() - this.startedAt;
    const cpu = process.cpuUsage(this.cpuAtStart);

    clearInterval(this.sampler);
    this.sample();
    this.histogram.disable();

    return {
      wallMs: Math.round(wallMs),
      cpuUserMs: Math.round(cpu.user / 1000),
      cpuSystemMs: Math.round(cpu.system / 1000),
      peakRssBytes: this.peakRssBytes,
      peakHeapUsedBytes: this.peakHeapUsedBytes,
      peakArrayBuffersBytes: this.peakArrayBuffersBytes,
      eventLoopDelayMs: this.eventLoopDelay(),
    };
  }

  private sample(): void {
    const memory = process.memoryUsage();

    this.peakRssBytes = Math.max(this.peakRssBytes, memory.rss);
    this.peakHeapUsedBytes = Math.max(this.peakHeapUsedBytes, memory.heapUsed);
    this.peakArrayBuffersBytes = Math.max(this.peakArrayBuffersBytes, memory.arrayBuffers);
  }

  /** Nanoseconds → milliseconds beyond the timer resolution, to 0.01 ms. */
  private eventLoopDelay(): EventLoopDelay {
    // A run shorter than one tick has no samples (the histogram reports NaN/huge minimums).
    if (this.histogram.count === 0) {
      return {
        p50: 0,
        p99: 0,
        max: 0,
      };
    }

    const delay = (nanoseconds: number): number =>
      Math.max(0, Math.round((nanoseconds / 1e6 - EVENT_LOOP_RESOLUTION_MS) * 100) / 100);

    return {
      p50: delay(this.histogram.percentile(50)),
      p99: delay(this.histogram.percentile(99)),
      max: delay(this.histogram.max),
    };
  }
}
