/** How `TaskRunnerService.retry` repeats a failing operation. */
export interface RetryPolicy {
  /** Attempts including the first. */
  attempts: number;
  /** The backoff cap doubles per attempt from here… */
  baseDelayMs: number;
  /** …up to this; the actual delay is random below the cap (full jitter). */
  maxDelayMs: number;
  /** Only errors this returns true for are retried; the caller's abort never is. */
  isRetryable: (error: unknown) => boolean;
}
