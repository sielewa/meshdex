import { Injectable } from '@nestjs/common';
import type { DbExecutor } from '../../database/database.types';
import { outbox } from '../../database/schema';

export interface OutboxEvent {
  eventId: string;
  topic: string;
  /** Kafka message key — the asset id, so one asset's events stay ordered. */
  key: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: number;
}

@Injectable()
export class OutboxRepository {
  /** Must run in the same transaction as the state change the event describes. */
  async append(event: OutboxEvent, tx: DbExecutor): Promise<void> {
    await tx.insert(outbox).values({ ...event, occurredAt: new Date(event.occurredAt) });
  }
}
