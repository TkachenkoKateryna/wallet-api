import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AccountsService } from './accounts.service.js';
import type { AccountResponseDto } from './dto/account-response.dto.js';

// Admin routes. Not protected: there is no authentication (see PRD).
@Controller('admin')
export class AdminAccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('users/:userId/accounts')
  findAllForUser(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<AccountResponseDto[]> {
    return this.accountsService.findAllForUserAsAdmin(userId);
  }

  @Post('accounts/:id/freeze')
  @HttpCode(HttpStatus.OK)
  freeze(@Param('id', ParseUUIDPipe) id: string): Promise<AccountResponseDto> {
    return this.accountsService.freeze(id);
  }

  @Post('accounts/:id/unfreeze')
  @HttpCode(HttpStatus.OK)
  unfreeze(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountResponseDto> {
    return this.accountsService.unfreeze(id);
  }

  @Post('accounts/:id/close')
  @HttpCode(HttpStatus.OK)
  close(@Param('id', ParseUUIDPipe) id: string): Promise<AccountResponseDto> {
    return this.accountsService.close(id);
  }
}
