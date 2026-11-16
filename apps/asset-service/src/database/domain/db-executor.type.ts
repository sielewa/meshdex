import type { Database } from './database.type';
import type { Transaction } from './transaction.type';

export type DbExecutor = Database | Transaction;
