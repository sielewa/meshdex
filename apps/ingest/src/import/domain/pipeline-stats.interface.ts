/**
 * Summed over workers. The waits name the bottleneck: blocked packers mean uploads are slower,
 * idle uploaders mean packing is.
 */
export interface PipelineStats {
  packBusyMs: number;
  uploadBusyMs: number;
  packerBlockedMs: number;
  uploaderIdleMs: number;
  maxQueued: number;
}
