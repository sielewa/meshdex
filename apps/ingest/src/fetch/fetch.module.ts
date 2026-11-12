import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { PolyhavenClientModule } from '../clients/polyhaven/polyhaven-client.module';
import { TasksModule } from '../tasks/tasks.module';
import { FetchService } from './fetch.service';

/** `ingest fetch`: Poly Haven → local model cache. */
@Module({
  imports: [
    PolyhavenClientModule,
    CacheModule,
    TasksModule,
  ],
  providers: [
    FetchService,
  ],
  exports: [
    FetchService,
  ],
})
export class FetchModule {}
