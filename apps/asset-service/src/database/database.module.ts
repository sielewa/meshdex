import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { databaseConfig } from '../config/config.namespaces';
import { DATABASE, PG_POOL } from './database.tokens';
import type { Database } from './domain/database.type';
import * as schema from './schema';

/**
 * One connection pool per process, shared by all repositories. The pool size is a
 * per-pod budget: total DB connections = pool max × replicas, which must stay
 * below Postgres' `max_connections` when the service scales out.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [
        databaseConfig.KEY,
      ],
      useFactory: (config: ConfigType<typeof databaseConfig>): Pool =>
        new Pool({
          connectionString: config.url,
          max: config.poolMax,
        }),
    },
    {
      provide: DATABASE,
      inject: [
        PG_POOL,
      ],
      // casing: TypeScript camelCase <-> snake_case columns (ADR 005).
      useFactory: (pool: Pool): Database => drizzle(pool, {
        schema,
        casing: 'snake_case',
      }),
    },
  ],
  exports: [
    DATABASE,
  ],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Runs after in-flight gRPC calls are drained, so no query loses its connection. */
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
