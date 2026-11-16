import { Injectable } from '@nestjs/common';
import type { DbExecutor } from '../../database/domain/db-executor.type';
import { outbox } from '../../database/schema';
import type { OutboxEvent } from '../domain/outbox-event.interface';

@Injectable()
export class OutboxRepository {
  /** Must run in the same transaction as the state change the event describes. */
  async append(event: OutboxEvent, tx: DbExecutor): Promise<void> {
    await tx.insert(outbox).values({
      ...event,
      occurredAt: new Date(event.occurredAt),
    });
  }
}
