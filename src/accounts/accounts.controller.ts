import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user-id.decorator.js';
import { UserIdGuard } from '../auth/user-id.guard.js';
import { AccountsService } from './accounts.service.js';
import type { AccountResponseDto } from './dto/account-response.dto.js';
import type { BalanceResponse } from './dto/balance-response.dto.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { StatementQueryDto } from './dto/statement-query.dto.js';
import type { StatementResponse } from './dto/statement-response.dto.js';

@Controller('accounts')
@UseGuards(UserIdGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateAccountDto,
  ): Promise<AccountResponseDto> {
    return this.accountsService.create(userId, dto);
  }

  @Get()
  findAll(@CurrentUserId() userId: string): Promise<AccountResponseDto[]> {
    return this.accountsService.findAllForUser(userId);
  }

  @Get(':id')
  findOne(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountResponseDto> {
    return this.accountsService.findOwned(id, userId);
  }

  @Get(':id/balance')
  getBalance(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BalanceResponse> {
    return this.accountsService.getBalance(id, userId);
  }

  @Get(':id/transactions')
  getStatement(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
  ): Promise<StatementResponse> {
    return this.accountsService.getStatement(id, userId, query);
  }
}
