import { DatabaseError } from 'pg';
import { AppError } from '../common/errors/app-error.js';
import type { DatabaseService } from '../database/database.service.js';
import type { UsersService } from '../users/users.service.js';
import type { AccountsRepository } from './accounts.repository.js';
import { AccountsService } from './accounts.service.js';
import type { AccountRow, AccountStatus } from './accounts.types.js';

const ACCOUNT_ID = '7d1f3c2a-4b5e-4c6d-8e7f-9a0b1c2d3e4f';
const USER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

function accountRow(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: ACCOUNT_ID,
    user_id: USER_ID,
    currency: 'USD',
    status: 'active',
    balance: '0.00',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function uniqueViolation(constraint: string): DatabaseError {
  const error = new DatabaseError('duplicate key', 0, 'error');
  error.code = '23505';
  error.constraint = constraint;
  return error;
}

describe('AccountsService', () => {
  let repository: {
    create: ReturnType<typeof vi.fn>;
    findOwned: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findAllByUserId: ReturnType<typeof vi.fn>;
    findStatusForUpdate: ReturnType<typeof vi.fn>;
    isBalanceZero: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    findStatement: ReturnType<typeof vi.fn>;
  };
  let usersService: { findOne: ReturnType<typeof vi.fn> };
  let service: AccountsService;
  const client = { query: vi.fn() };

  beforeEach(() => {
    repository = {
      create: vi.fn(),
      findOwned: vi.fn(),
      findById: vi.fn(),
      findAllByUserId: vi.fn(),
      findStatusForUpdate: vi.fn(),
      isBalanceZero: vi.fn(),
      updateStatus: vi.fn(),
      findStatement: vi.fn(),
    };
    usersService = { findOne: vi.fn() };
    const db = {
      transaction: vi.fn((callback: (c: typeof client) => unknown) =>
        callback(client),
      ),
    };

    service = new AccountsService(
      repository as unknown as AccountsRepository,
      usersService as unknown as UsersService,
      db as unknown as DatabaseService,
    );
  });

  describe('create', () => {
    it('returns the new account', async () => {
      repository.create.mockResolvedValue(accountRow());

      await expect(
        service.create(USER_ID, { currency: 'USD' }),
      ).resolves.toMatchObject({ id: ACCOUNT_ID, balance: '0.00' });
      expect(repository.create).toHaveBeenCalledWith(USER_ID, 'USD');
    });

    it('maps a duplicate currency to WALLET_EXISTS', async () => {
      repository.create.mockRejectedValue(
        uniqueViolation('uq_accounts_user_currency'),
      );

      await expect(
        service.create(USER_ID, { currency: 'USD' }),
      ).rejects.toMatchObject({ code: 'WALLET_EXISTS' });
    });

    it('rethrows other database errors', async () => {
      const error = uniqueViolation('some_other_constraint');
      repository.create.mockRejectedValue(error);

      await expect(service.create(USER_ID, { currency: 'USD' })).rejects.toBe(
        error,
      );
    });
  });

  describe('findOwned', () => {
    it('returns 404 when the account is missing or not owned', async () => {
      repository.findOwned.mockResolvedValue(null);

      await expect(
        service.findOwned(ACCOUNT_ID, USER_ID),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('does not expose internal columns', async () => {
      repository.findOwned.mockResolvedValue({
        ...accountRow(),
        account_type: 'wallet',
        system_code: null,
      });

      const account = await service.findOwned(ACCOUNT_ID, USER_ID);

      expect(account).not.toHaveProperty('account_type');
      expect(account).not.toHaveProperty('system_code');
    });
  });

  describe('findAllForUserAsAdmin', () => {
    it('returns 404 for an unknown user', async () => {
      usersService.findOne.mockRejectedValue(
        new AppError('NOT_FOUND', 'User not found'),
      );

      await expect(
        service.findAllForUserAsAdmin(USER_ID),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(repository.findAllByUserId).not.toHaveBeenCalled();
    });
  });

  describe('getStatement', () => {
    const entry = (n: number) => ({
      entry_id: `00000000-0000-4000-8000-00000000000${n}`,
      operation_id: ACCOUNT_ID,
      operation_type: 'deposit',
      amount: '10.00',
      balance_after: '10.00',
      counterparty_account_id: null,
      created_at: new Date(),
      cursor_created_at: `2026-01-0${n} 00:00:00.123456+00`,
    });

    beforeEach(() => {
      repository.findOwned.mockResolvedValue(accountRow());
    });

    it('returns a cursor when there are more entries than the limit', async () => {
      repository.findStatement.mockResolvedValue([
        entry(3),
        entry(2),
        entry(1),
      ]);

      const page = await service.getStatement(ACCOUNT_ID, USER_ID, {
        limit: 2,
      });

      expect(page.items).toHaveLength(2);
      expect(page.items[0]).not.toHaveProperty('cursor_created_at');
      expect(page.next_cursor).not.toBeNull();
    });

    it('returns no cursor on the last page', async () => {
      repository.findStatement.mockResolvedValue([entry(1)]);

      const page = await service.getStatement(ACCOUNT_ID, USER_ID, {
        limit: 2,
      });

      expect(page.next_cursor).toBeNull();
    });

    it('checks ownership before reading entries', async () => {
      repository.findOwned.mockResolvedValue(null);

      await expect(
        service.getStatement(ACCOUNT_ID, USER_ID, { limit: 2 }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(repository.findStatement).not.toHaveBeenCalled();
    });
  });

  describe('status changes', () => {
    function givenStatus(status: AccountStatus | null) {
      repository.findStatusForUpdate.mockResolvedValue(status);
      repository.findById.mockResolvedValue(accountRow());
    }

    it.each([
      ['freeze', 'active', 'frozen'],
      ['unfreeze', 'frozen', 'active'],
      ['close', 'active', 'closed'],
      ['close', 'frozen', 'closed'],
    ] as const)('%s from %s sets %s', async (action, from, to) => {
      givenStatus(from);
      repository.isBalanceZero.mockResolvedValue(true);

      await service[action](ACCOUNT_ID);

      expect(repository.findStatusForUpdate).toHaveBeenCalledWith(
        client,
        ACCOUNT_ID,
      );
      expect(repository.updateStatus).toHaveBeenCalledWith(
        client,
        ACCOUNT_ID,
        to,
      );
    });

    it.each([
      ['freeze', 'frozen', 'WALLET_NOT_ACTIVE'],
      ['freeze', 'closed', 'WALLET_NOT_ACTIVE'],
      ['unfreeze', 'active', 'INVALID_STATUS_TRANSITION'],
      ['unfreeze', 'closed', 'WALLET_NOT_ACTIVE'],
      ['close', 'closed', 'WALLET_NOT_ACTIVE'],
    ] as const)(
      '%s from %s is rejected with %s',
      async (action, from, code) => {
        givenStatus(from);

        await expect(service[action](ACCOUNT_ID)).rejects.toMatchObject({
          code,
        });
        expect(repository.updateStatus).not.toHaveBeenCalled();
      },
    );

    it('returns NOT_FOUND for an unknown account', async () => {
      givenStatus(null);

      await expect(service.freeze(ACCOUNT_ID)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('refuses to close an account with a non-zero balance', async () => {
      givenStatus('active');
      repository.isBalanceZero.mockResolvedValue(false);

      await expect(service.close(ACCOUNT_ID)).rejects.toMatchObject({
        code: 'WALLET_NOT_EMPTY',
      });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });
  });
});
