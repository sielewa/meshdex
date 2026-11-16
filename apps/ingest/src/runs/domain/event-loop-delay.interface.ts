/** How late the event loop ran timers, in milliseconds, with the timer resolution subtracted. */
export interface EventLoopDelay {
  p50: number;
  p99: number;
  max: number;
}
