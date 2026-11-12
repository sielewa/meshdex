import { Module } from '@nestjs/common';
import { TaskRunnerService } from './task-runner.service';

/** Concurrency building blocks shared by the commands; `BoundedQueue` is created per run. */
@Module({
  providers: [
    TaskRunnerService,
  ],
  exports: [
    TaskRunnerService,
  ],
})
export class TasksModule {}
