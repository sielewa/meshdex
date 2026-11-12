import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';

/** Concurrency building blocks shared by the commands; `BoundedQueue` is created per run. */
@Module({
  providers: [
    TasksService,
  ],
  exports: [
    TasksService,
  ],
})
export class TasksModule {}
