import { Module } from '@nestjs/common';
import { RunRecorderService } from './run-recorder.service';

/** Measuring and recording command runs for benchmarks. */
@Module({
  providers: [
    RunRecorderService,
  ],
  exports: [
    RunRecorderService,
  ],
})
export class RunsModule {}
