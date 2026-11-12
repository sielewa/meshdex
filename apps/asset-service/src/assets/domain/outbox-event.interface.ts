/** An integration event waiting in the outbox for the relay to publish it to Kafka. */
export interface OutboxEvent {
  eventId: string;
  topic: string;
  /** Kafka message key — the asset id, so one asset's events stay ordered. */
  key: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: number;
}
