import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { PG_POOL } from './database.constants.js';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<R>> {
    return this.pool.query<R>(sql, params);
  }

  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    let destroyClient = false;
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The connection is broken: discard it instead of returning it to the pool
        destroyClient = true;
      }
      throw err;
    } finally {
      client.release(destroyClient);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
