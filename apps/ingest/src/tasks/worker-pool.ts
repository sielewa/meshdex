import { Worker, type Transferable, type WorkerOptions } from 'node:worker_threads';
import { WorkerPoolException } from './exceptions/worker-pool.exception';

/**
 * A fixed set of worker threads, each handling one request at a time; requests beyond the
 * number of idle workers wait in order.
 *
 * Messages are structured-cloned between threads, except what is listed in `transfer`: an
 * `ArrayBuffer` in the transfer list moves to the other thread without a copy (and becomes
 * unusable on the sending side). A worker that crashes or exits fails its request and closes
 * the pool: per-request errors are the worker's job to report as a normal response.
 */
export class WorkerPool<TRequest, TResponse> {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly busy = new Map<
    Worker,
    { resolve: (response: TResponse) => void; reject: (reason: unknown) => void }
  >();
  private readonly pending: {
    request: TRequest;
    transfer: readonly Transferable[];
    resolve: (response: TResponse) => void;
    reject: (reason: unknown) => void;
  }[] = [];
  private failure: WorkerPoolException | null = null;

  constructor(filename: string, size: number, options: WorkerOptions = {}) {
    if (!Number.isInteger(size) || size < 1) {
      throw new RangeError(`Worker pool size must be a positive integer, got ${String(size)}`);
    }

    for (let index = 0; index < size; index += 1) {
      const worker = new Worker(filename, options);

      worker.on('message', (response: TResponse) => {
        this.onResponse(worker, response);
      });
      worker.on('error', (error) => {
        this.fail(new WorkerPoolException('A worker thread crashed', { cause: error }));
      });
      worker.on('exit', (code) => {
        this.fail(new WorkerPoolException(`A worker thread exited with code ${String(code)}`));
      });
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  run(request: TRequest, transfer: readonly Transferable[] = []): Promise<TResponse> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }

    return new Promise<TResponse>((resolve, reject) => {
      this.pending.push({
        request,
        transfer,
        resolve,
        reject,
      });
      this.dispatch();
    });
  }

  /** Stops every worker; waiting and later requests are rejected. */
  async close(): Promise<void> {
    this.fail(new WorkerPoolException('The worker pool is closed'));
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }

  private dispatch(): void {
    while (this.idle.length > 0 && this.pending.length > 0) {
      const worker = this.idle.pop() as Worker;
      const task = this.pending.shift() as (typeof this.pending)[number];

      this.busy.set(worker, task);
      worker.postMessage(task.request, task.transfer);
    }
  }

  private onResponse(worker: Worker, response: TResponse): void {
    const task = this.busy.get(worker);

    this.busy.delete(worker);
    this.idle.push(worker);
    task?.resolve(response);
    this.dispatch();
  }

  /** First failure wins; everything in flight or waiting is rejected with it. */
  private fail(failure: WorkerPoolException): void {
    if (this.failure !== null) {
      return;
    }

    this.failure = failure;

    for (const task of [...this.busy.values(), ...this.pending.splice(0)]) {
      task.reject(failure);
    }

    this.busy.clear();
  }
}
