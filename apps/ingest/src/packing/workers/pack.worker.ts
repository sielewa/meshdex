import { parentPort, workerData } from 'node:worker_threads';
import type { PinoLogger } from 'nestjs-pino';
import { CacheService } from '../../cache/cache.service';
import type { PackRequest } from '../domain/pack-request.interface';
import type { PackResponse } from '../domain/pack-response.type';
import type { PackWorkerData } from '../domain/pack-worker-data.interface';
import { PackingService } from '../packing.service';

/**
 * Runs `PackingService` outside Nest's DI: a worker has its own module graph. The GLB goes back
 * by transfer, so the main thread gets it without a copy.
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
const packer = new PackingService(new CacheService({ dir: cacheDir }), logger);

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
