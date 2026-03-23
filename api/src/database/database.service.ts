import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

@Injectable()
export class DatabaseService implements OnModuleInit {
    client: ReturnType<typeof drizzle<typeof schema>>

    constructor(private config: ConfigService) { }

    onModuleInit() {
        const sql = neon(this.config.get<string>('DATABASE_URL')!)
        this.client = drizzle(sql, { schema })
    }
}