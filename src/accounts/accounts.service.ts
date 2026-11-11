import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DatabaseError } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import { UsersService } from '../users/users.service.js';
import { AccountsRepository } from './accounts.repository.js';
import type { AccountStatus } from './accounts.types.js';
import {
  decodeCursor,
  encodeCursor,
} from '../common/pagination/keyset-cursor.js';
import { AccountResponseDto } from './dto/account-response.dto.js';
import type { BalanceResponse } from './dto/balance-response.dto.js';
import type { CreateAccountDto } from './dto/create-account.dto.js';
import type { StatementQueryDto } from './dto/statement-query.dto.js';
import type { StatementResponse } from './dto/statement-response.dto.js';

@Injectable()
export class AccountsService {
  constructor(
    private readonly accountsRepository: AccountsRepository,
    private readonly usersService: UsersService,
    private readonly db: DatabaseService,
  ) {}

  async create(
    userId: string,
    dto: CreateAccountDto,
  ): Promise<AccountResponseDto> {
    try {
      const row = await this.accountsRepository.create(userId, dto.currency);

      return AccountResponseDto.from(row);
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        error.code === '23505' &&
        error.constraint === 'uq_accounts_user_currency'
      ) {
        throw new ConflictException(
          `User already has a ${dto.currency} account`,
        );
      }

      throw error;
    }
  }

  async findAllForUser(userId: string): Promise<AccountResponseDto[]> {
    const rows = await this.accountsRepository.findAllByUserId(userId);

    return rows.map((row) => AccountResponseDto.from(row));
  }

  async findAllForUserAsAdmin(userId: string): Promise<AccountResponseDto[]> {
    await this.usersService.findOne(userId);

    return this.findAllForUser(userId);
  }

  async findOwned(id: string, userId: string): Promise<AccountResponseDto> {
    const row = await this.accountsRepository.findOwned(id, userId);

    if (!row) {
      throw new NotFoundException('Account not found');
    }

    return AccountResponseDto.from(row);
  }

  async getBalance(id: string, userId: string): Promise<BalanceResponse> {
    const account = await this.findOwned(id, userId);

    return {
      account_id: account.id,
      currency: account.currency,
      balance: account.balance,
    };
  }

  async getStatement(
    id: string,
    userId: string,
    query: StatementQueryDto,
  ): Promise<StatementResponse> {
    await this.findOwned(id, userId);

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.accountsRepository.findStatement(
      id,
      cursor,
      query.limit,
    );

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const hasMore = rows.length > query.limit;

    return {
      items: page.map((row) => ({
        entry_id: row.entry_id,
        operation_id: row.operation_id,
        operation_type: row.operation_type,
        amount: row.amount,
        balance_after: row.balance_after,
        counterparty_account_id: row.counterparty_account_id,
        created_at: row.created_at,
      })),
      next_cursor:
        hasMore && last
          ? encodeCursor({
              createdAt: last.cursor_created_at,
              id: last.entry_id,
            })
          : null,
    };
  }

  freeze(id: string): Promise<AccountResponseDto> {
    return this.changeStatus(id, ['active'], 'frozen');
  }

  unfreeze(id: string): Promise<AccountResponseDto> {
    return this.changeStatus(id, ['frozen'], 'active');
  }

  close(id: string): Promise<AccountResponseDto> {
    return this.changeStatus(id, ['active', 'frozen'], 'closed', {
      requireZeroBalance: true,
    });
  }

  // Runs with the account row locked (SELECT ... FOR UPDATE). The posting
  // service must lock the same rows and re-check status = 'active', so a
  // freeze or close cannot interleave with a transfer, and no money can
  // arrive between the zero-balance check and the close.
  private changeStatus(
    id: string,
    allowedFrom: AccountStatus[],
    to: AccountStatus,
    { requireZeroBalance = false } = {},
  ): Promise<AccountResponseDto> {
    return this.db.transaction(async (client) => {
      const status = await this.accountsRepository.findStatusForUpdate(
        client,
        id,
      );

      if (!status) {
        throw new NotFoundException('Account not found');
      }

      if (!allowedFrom.includes(status)) {
        throw new UnprocessableEntityException(
          `Cannot change account status from ${status} to ${to}`,
        );
      }

      if (
        requireZeroBalance &&
        !(await this.accountsRepository.isBalanceZero(client, id))
      ) {
        throw new UnprocessableEntityException(
          'Account balance must be zero to close it',
        );
      }

      await this.accountsRepository.updateStatus(client, id, to);
      const row = await this.accountsRepository.findById(client, id);

      if (!row) {
        // Unreachable: the row is locked FOR UPDATE in this transaction.
        throw new Error(`Account ${id} vanished during a status change`);
      }

      return AccountResponseDto.from(row);
    });
  }
}
