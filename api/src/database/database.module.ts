import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { DRIZZLE } from '@/database/database.constants';
import * as schema from '@/database/schemas/index';

export type DrizzleDb = NodePgDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE_POOL',
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({
          connectionString: config.getOrThrow<string>('database.url'),
        }),
    },
    {
      provide: DRIZZLE,
      inject: ['DATABASE_POOL'],
      useFactory: (pool: Pool) => drizzle(pool, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject('DATABASE_POOL') private readonly pool: Pool) {}

  async onModuleDestroy() {
    await this.pool.end();
  }
}
