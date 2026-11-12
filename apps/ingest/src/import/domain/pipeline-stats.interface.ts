/**
 * Where the pipeline's time went, summed over workers (so totals can exceed the run's wall
 * time). The two waits name the bottleneck: packers blocked on a full queue mean uploads are
 * slower; uploaders idle on an empty queue mean packing is slower.
 */
export interface PipelineStats {
  packBusyMs: number;
  uploadBusyMs: number;
  /** Packers waiting in `push` because the queue was full (backpressure). */
  packerBlockedMs: number;
  /** Uploaders waiting in `take` because nothing was packed yet. */
  uploaderIdleMs: number;
  /** Most packed models ever waiting in the queue. */
  maxQueued: number;
}
