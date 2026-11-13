import { Injectable } from '@nestjs/common';
import type { Currency } from '../accounts/accounts.constants.js';
import type { Queryable } from '../database/database.types.js';
import type { LedgerEntryInput, LockedAccount } from './ledger.types.js';

// Every method takes the executor first, so callers run it on the client of
// their transaction.
@Injectable()
export class LedgerRepository {
  // Locks are taken in id order (the row-locking step runs after the sort).
  // Every transaction locking in the same order is what prevents deadlocks.
  async lockAccounts(
    executor: Queryable,
    ids: string[],
  ): Promise<LockedAccount[]> {
    const { rows } = await executor.query<LockedAccount>(
      `
        SELECT id, account_type AS "accountType", currency, status
        FROM accounts
        WHERE id = ANY($1::UUID[])
        ORDER BY id
        FOR UPDATE
      `,
      [ids],
    );

    return rows;
  }

  // No lock: an account's currency never changes
  async findCurrencies(
    executor: Queryable,
    ids: string[],
  ): Promise<{ id: string; currency: Currency }[]> {
    const { rows } = await executor.query<{ id: string; currency: Currency }>(
      `
        SELECT id, currency
        FROM accounts
        WHERE id = ANY($1::UUID[])
      `,
      [ids],
    );

    return rows;
  }

  async getBalance(executor: Queryable, accountId: string): Promise<string> {
    const { rows } = await executor.query<{ balance: string }>(
      `
        SELECT COALESCE(SUM(amount), 0)::NUMERIC(19, 2) AS balance
        FROM ledger_entries
        WHERE account_id = $1
      `,
      [accountId],
    );

    return rows[0].balance;
  }

  async findSettlementId(
    executor: Queryable,
    currency: Currency,
  ): Promise<string | null> {
    const { rows } = await executor.query<{ id: string }>(
      `
        SELECT id
        FROM accounts
        WHERE account_type = 'system'
          AND system_code = 'settlement'
          AND currency = $1
      `,
      [currency],
    );

    return rows[0]?.id ?? null;
  }

  async insertTransaction(
    executor: Queryable,
    operationId: string,
    description: string | null,
  ): Promise<string> {
    const { rows } = await executor.query<{ id: string }>(
      `
        INSERT INTO ledger_transactions (operation_id, description)
        VALUES ($1, $2)
        RETURNING id
      `,
      [operationId, description],
    );

    return rows[0].id;
  }

  // One statement for all rows. $1 needs the cast: in INSERT ... SELECT the
  // column type isn't applied to it, so it would resolve as text.
  async insertEntries(
    executor: Queryable,
    transactionId: string,
    entries: LedgerEntryInput[],
  ): Promise<void> {
    await executor.query(
      `
        INSERT INTO ledger_entries (ledger_transaction_id, account_id, amount)
        SELECT $1::UUID, *
        FROM unnest($2::UUID[], $3::NUMERIC[])
      `,
      [
        transactionId,
        entries.map((e) => e.accountId),
        entries.map((e) => e.amount),
      ],
    );
  }

  // TODO: move to the operations module
  async markPosted(executor: Queryable, operationId: string): Promise<boolean> {
    const { rows } = await executor.query(
      `
        UPDATE financial_operations
        SET status = 'posted', updated_at = NOW()
        WHERE id = $1
          AND status = 'pending'
        RETURNING id
      `,
      [operationId],
    );

    return rows.length > 0;
  }
}
