import { RunProbe } from './run-probe';

describe('RunProbe', () => {
  it('sees the event loop blocked by synchronous work', async () => {
    const probe = new RunProbe();

    // Let the 1 ms timer tick normally first, then hold the loop for 30 ms.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const end = Date.now() + 30;

    while (Date.now() < end) {
      // busy wait: nothing else can run on this thread
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
    const measurements = probe.stop();

    expect(measurements.eventLoopDelayMs.max).toBeGreaterThanOrEqual(25);
    expect(measurements.eventLoopDelayMs.p50).toBeLessThan(measurements.eventLoopDelayMs.max);
    expect(measurements.wallMs).toBeGreaterThanOrEqual(50);
    expect(measurements.cpuUserMs).toBeGreaterThanOrEqual(20);
  });

  it('counts memory outside the JS heap, where GLB buffers live', () => {
    const probe = new RunProbe();
    const buffer = new Uint8Array(64 * 1024 * 1024).fill(1);
    const measurements = probe.stop();

    expect(measurements.peakArrayBuffersBytes).toBeGreaterThanOrEqual(buffer.byteLength);
    expect(measurements.peakRssBytes).toBeGreaterThan(measurements.peakHeapUsedBytes);
  });

  it('reports no delay for a run shorter than one tick', () => {
    const measurements = new RunProbe().stop();

    expect(measurements.eventLoopDelayMs).toEqual({
      p50: 0,
      p99: 0,
      max: 0,
    });
  });
});
