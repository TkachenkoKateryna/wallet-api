import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import {
  isRetryable,
  tryAgainError,
} from '../common/errors/postgres-errors.js';
import { PG_POOL } from './database.constants.js';

const MAX_ATTEMPTS = 3;
const MIN_RETRY_DELAY_MS = 10;
const MAX_RETRY_DELAY_MS = 50;

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  query<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<R>> {
    return this.pool.query<R>(sql, params);
  }

  /**
   * Runs `callback` in a transaction, re-running it on a new BEGIN after a
   * deadlock or serialization failure (up to MAX_ATTEMPTS, then TRY_AGAIN).
   * The callback must be safe to repeat: no external calls, no state kept
   * between attempts, and no swallowed database errors.
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.runOnce(callback);
      } catch (err) {
        if (!isRetryable(err)) {
          throw err;
        }

        this.logger.warn(
          `Transaction attempt ${attempt}/${MAX_ATTEMPTS} failed with ${err.code}: ${err.message}`,
        );

        if (attempt >= MAX_ATTEMPTS) {
          throw tryAgainError();
        }

        await sleep(
          MIN_RETRY_DELAY_MS +
            Math.random() * (MAX_RETRY_DELAY_MS - MIN_RETRY_DELAY_MS),
        );
      }
    }
  }

  private async runOnce<T>(
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
