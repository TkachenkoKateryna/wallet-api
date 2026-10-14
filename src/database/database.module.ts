import { Global, Logger, Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Pool } from 'pg';
import { PG_POOL } from './database.constants.js';
import { DatabaseService } from './database.service.js';
import databaseConfig from '../config/database.config.js';

@Global()
@Module({
  imports: [],
  providers: [
    {
      provide: PG_POOL,
      inject: [databaseConfig.KEY],
      useFactory: async (
        config: ConfigType<typeof databaseConfig>,
      ): Promise<Pool> => {
        const logger = new Logger('Database');
        const pool = new Pool({
          host: config.host,
          port: config.port,
          database: config.name,
          user: config.user,
          password: config.password,
          max: config.poolMax,
        });

        // An idle client losing its connection emits 'error' on the pool;
        // without a listener that would crash the process.
        pool.on('error', (error) => {
          logger.error('Unexpected PostgreSQL pool error', error.stack);
        });

        // Fail fast at startup instead of on the first request.
        try {
          const { rows } = await pool.query<{ db: string }>(
            'SELECT current_database() AS db',
          );

          logger.log(`Connected to PostgreSQL: ${rows[0].db}`);

          return pool;
        } catch (error) {
          await pool.end();
          throw error;
        }
      },
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
