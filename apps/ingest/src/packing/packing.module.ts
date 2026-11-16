import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { PackingService } from './packing.service';
import { WorkerPackingService } from './worker-packing.service';

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
