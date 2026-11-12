import { Module } from '@nestjs/common';
import { ModelCacheService } from './model-cache.service';

/** The local model cache shared by `fetch` (writes) and `import` (reads). */
@Module({
  providers: [
    ModelCacheService,
  ],
  exports: [
    ModelCacheService,
  ],
})
export class CacheModule {}
