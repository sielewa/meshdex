import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { PackingModule } from '../packing/packing.module';
import { RunsModule } from '../runs/runs.module';
import { TasksModule } from '../tasks/tasks.module';
import { UploadModule } from '../upload/upload.module';
import { ImportService } from './import.service';
import { ImportStateService } from './import-state.service';

/**
 * `ingest import`: picks cached models, runs them through packing → upload as a pipeline,
 * remembers what was imported and measures the run. The work itself is done by
 * `PackingModule` and `UploadModule`.
 */
@Module({
  imports: [
    CacheModule,
    TasksModule,
    RunsModule,
    PackingModule,
    UploadModule,
  ],
  providers: [
    ImportService,
    ImportStateService,
  ],
  exports: [
    ImportService,
  ],
})
export class ImportModule {}
