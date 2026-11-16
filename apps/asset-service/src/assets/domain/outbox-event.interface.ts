export interface OutboxEvent {
  eventId: string;
  topic: string;
  /** The asset id, so one asset's events stay ordered. */
  key: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: number;
}
