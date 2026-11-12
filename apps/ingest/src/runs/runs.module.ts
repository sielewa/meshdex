import { Module } from '@nestjs/common';
import { RunsService } from './runs.service';

/** Measuring and recording command runs for benchmarks. */
@Module({
  providers: [
    RunsService,
  ],
  exports: [
    RunsService,
  ],
})
export class RunsModule {}
