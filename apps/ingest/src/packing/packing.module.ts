import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { PackingService } from './packing.service';
import { WorkerPackingService } from './worker-packing.service';

/**
 * Cached glTF → GLB bytes (ADR 013), on the main thread (`PackingService`) or in worker
 * threads (`WorkerPackingService`, which runs the same packer in `workers/pack.worker.ts`).
 * Knows only the cache; what happens to the GLB is the caller's business.
 */
@Module({
  imports: [
    CacheModule,
  ],
  providers: [
    PackingService,
    WorkerPackingService,
  ],
  exports: [
    PackingService,
    WorkerPackingService,
  ],
})
export class PackingModule {}
