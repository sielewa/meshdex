import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Repositories accept either the pool-backed client or an open transaction. */
export type DbExecutor = Database | Transaction;

export const DATABASE = Symbol('DATABASE');
