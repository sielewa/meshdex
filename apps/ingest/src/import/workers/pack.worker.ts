import { parentPort, workerData } from 'node:worker_threads';
import type { PinoLogger } from 'nestjs-pino';
import { ModelCacheService } from '../../cache/model-cache.service';
import type { PackRequest } from '../domain/pack-request.interface';
import type { PackResponse } from '../domain/pack-response.type';
import type { PackWorkerData } from '../domain/pack-worker-data.interface';
import { ModelPackerService } from '../model-packer.service';

/**
 * Worker thread entry point (`ingest import --pack-in-workers`), like `main.ts` an exception
 * to the one-class-per-file rule. It runs the same `ModelPackerService` as the main thread,
 * outside Nest's DI: a worker is a separate JavaScript environment with its own module graph,
 * so it builds only what packing needs. Reading files, parsing JSON and copying buffers then
 * happen here, and the main thread's event loop stays free for uploads.
 *
 * The finished GLB goes back by transfer: its `ArrayBuffer` moves to the main thread instead
 * of being copied, so a worker costs no extra copy of the model.
 */
if (parentPort === null) {
  throw new Error('pack.worker must run in a worker thread');
}

const port = parentPort;
const { cacheDir } = workerData as PackWorkerData;
let warnings: string[] = [];
const logger = {
  debug: () => undefined,
  warn: (text: string) => warnings.push(text),
  error: (text: string) => warnings.push(text),
} as unknown as PinoLogger;
const packer = new ModelPackerService(new ModelCacheService({ dir: cacheDir }), logger);

/** The pool sends one request at a time to a worker, so `warnings` belongs to this request. */
async function handle(request: PackRequest): Promise<void> {
  warnings = [];

  try {
    const glb = await packer.pack(request.manifest);
    // Transfer needs the view to cover its whole buffer; otherwise copy it once.
    const bytes =
      glb.byteOffset === 0 && glb.byteLength === glb.buffer.byteLength ? glb : glb.slice();
    const response: PackResponse = {
      ok: true,
      glb: bytes,
      warnings,
    };

    port.postMessage(response, [bytes.buffer as ArrayBuffer]);
  } catch (error) {
    const response: PackResponse = {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      warnings,
    };

    port.postMessage(response);
  }
}

port.on('message', (request: PackRequest) => {
  void handle(request);
});
