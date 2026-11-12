import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';

/** The local model cache shared by `fetch` (writes) and `import` (reads). */
@Module({
  providers: [
    CacheService,
  ],
  exports: [
    CacheService,
  ],
})
export class CacheModule {}
