import { Module, Controller, Get } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'
import { UsersModule } from './users/users.module';
import { DumpsModule } from './dumps/dumps.module';
import { PrepsModule } from './preps/preps.module';
import { PushTokensModule } from './push-tokens/push-tokens.module';
import { UserPreferencesModule } from './user-preferences/user-preferences.module';
import { DatabaseModule } from './database/database.module';

@Controller()
export class AppController {
  @Get()
  getHello(): string {
    return 'Pem API is running!';
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    UsersModule,
    DumpsModule,
    PrepsModule,
    PushTokensModule,
    UserPreferencesModule,
    DatabaseModule,
  ],
  controllers: [AppController],
})
export class AppModule { }
