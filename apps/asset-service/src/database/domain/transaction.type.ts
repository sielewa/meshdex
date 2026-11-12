import type { Database } from './database.type';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
