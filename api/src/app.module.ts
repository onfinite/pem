import { Module, Controller, Get } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { DumpsModule } from './dumps/dumps.module';
import { PrepsModule } from './preps/preps.module';
import { DatabaseModule } from './database/database.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        UsersModule,
        DumpsModule,
        PrepsModule,
        DatabaseModule,
    ],
})
export class AppModule {}
