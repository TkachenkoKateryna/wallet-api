import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import databaseConfig from './config/database.config.js';
import { appConfigSchema } from './config/config.types.js';
import { UsersModule } from './users/users.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { LedgerModule } from './ledger/ledger.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      skipProcessEnv: true,
      load: [databaseConfig],
      validationSchema: appConfigSchema,
      validationOptions: {
        libraryOptions: {
          abortEarly: true,
        },
      },
    }),
    DatabaseModule,
    UsersModule,
    AccountsModule,
    LedgerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
