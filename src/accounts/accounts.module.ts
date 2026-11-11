import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsRepository } from './accounts.repository.js';
import { AccountsService } from './accounts.service.js';
import { AdminAccountsController } from './admin-accounts.controller.js';

@Module({
  imports: [UsersModule],
  controllers: [AccountsController, AdminAccountsController],
  providers: [AccountsService, AccountsRepository],
})
export class AccountsModule {}
