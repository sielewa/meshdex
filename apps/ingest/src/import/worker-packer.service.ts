import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { CachedModelManifest } from '../cache/domain/cached-model-manifest.interface';
import { cacheConfig } from '../config/config.namespaces';
import { WorkerPool } from '../tasks/worker-pool';
import type { PackRequest } from './domain/pack-request.interface';
import type { PackResponse } from './domain/pack-response.type';
import type { PackWorkerData } from './domain/pack-worker-data.interface';
import type { PackerPool } from './domain/packer-pool.interface';
import { ModelPackingException } from './exceptions/model-packing.exception';
import { PACK_WORKER_FILE } from './import.constants';

/**
 * Packing in worker threads (`--pack-in-workers`), the experiment of ADR 013's pipeline: the
 * same packer, moved off the main thread. Opened per run with one worker per pack slot, so
 * the pipeline's pack concurrency is also the number of threads.
 */
@Injectable()
export class WorkerPackerService {
  constructor(
    @Inject(cacheConfig.KEY)
    private readonly cacheSettings: ConfigType<typeof cacheConfig>,
    @InjectPinoLogger(WorkerPackerService.name)
    private readonly logger: PinoLogger,
  ) {}

  open(size: number): PackerPool {
    const workerData: PackWorkerData = { cacheDir: this.cacheSettings.dir };
    // The compiled worker sits next to this file in dist/ (import/workers/pack.worker.js).
    const pool = new WorkerPool<PackRequest, PackResponse>(
      join(__dirname, 'workers', PACK_WORKER_FILE),
      size,
      { workerData },
    );

    return {
      pack: async (manifest) => this.unwrap(manifest, await pool.run({ manifest })),
      close: () => pool.close(),
    };
  }

  private unwrap(manifest: CachedModelManifest, response: PackResponse): Uint8Array {
    for (const warning of response.warnings) {
      this.logger.warn({ modelId: manifest.modelId }, warning);
    }

    if (!response.ok) {
      throw new ModelPackingException(response.message);
    }

    return response.glb;
  }
}
