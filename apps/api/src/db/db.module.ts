import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

export const DRIZZLE = Symbol('DRIZZLE_DB');

@Module({
  providers: [
    {
      provide: 'PG_POOL',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url =
          config.get<string>('DATABASE_URL') ??
          'postgres://tuya:tuya@localhost:5432/tuya';
        return new Pool({ connectionString: url });
      },
    },
    {
      provide: DRIZZLE,
      inject: ['PG_POOL'],
      useFactory: (pool: Pool): Db => drizzle(pool, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DbModule {}

