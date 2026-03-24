import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';
import ws from 'ws';

@Injectable()
export class DatabaseService implements OnModuleInit {
    client: ReturnType<typeof drizzle<typeof schema>>;

    onModuleInit() {
        neonConfig.webSocketConstructor = ws;
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL!,
            max: parseInt(process.env.MAX_DB_CONNECTIONS!),
        });
        this.client = drizzle(pool, { schema });
    }
}
