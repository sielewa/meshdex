import type { Database } from './database.type';
import type { Transaction } from './transaction.type';

/** Repositories accept either the pool-backed client or an open transaction. */
export type DbExecutor = Database | Transaction;
