import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { Queryable } from '../database/database.types.js';
import type { KeysetCursor } from '../common/pagination/keyset-cursor.js';
import type { Currency } from './accounts.constants.js';
import type {
  AccountRow,
  AccountStatus,
  StatementEntryRow,
} from './accounts.types.js';

// Every query filters account_type = 'wallet': system accounts are never
// visible through this repository.
const ACCOUNT_WITH_BALANCE = `
  SELECT
    a.id, a.user_id, a.currency, a.status,
    COALESCE(SUM(le.amount), 0)::NUMERIC(19, 2) AS balance,
    a.created_at, a.updated_at
  FROM accounts a
  LEFT JOIN ledger_entries le
    ON le.account_id = a.id
`;

@Injectable()
export class AccountsRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(userId: string, currency: Currency): Promise<AccountRow> {
    const { rows } = await this.db.query<AccountRow>(
      `
        INSERT INTO accounts (user_id, account_type, currency)
        VALUES ($1, 'wallet', $2)
        RETURNING
          id, user_id, currency, status,
          '0.00' AS balance,
          created_at, updated_at
      `,
      [userId, currency],
    );

    return rows[0];
  }

  async findOwned(id: string, userId: string): Promise<AccountRow | null> {
    const { rows } = await this.db.query<AccountRow>(
      `
        ${ACCOUNT_WITH_BALANCE}
        WHERE a.id = $1
          AND a.user_id = $2
          AND a.account_type = 'wallet'
        GROUP BY a.id
      `,
      [id, userId],
    );

    return rows[0] ?? null;
  }

  async findById(executor: Queryable, id: string): Promise<AccountRow | null> {
    const { rows } = await executor.query<AccountRow>(
      `
        ${ACCOUNT_WITH_BALANCE}
        WHERE a.id = $1
          AND a.account_type = 'wallet'
        GROUP BY a.id
      `,
      [id],
    );

    return rows[0] ?? null;
  }

  async findAllByUserId(userId: string): Promise<AccountRow[]> {
    const { rows } = await this.db.query<AccountRow>(
      `
        ${ACCOUNT_WITH_BALANCE}
        WHERE a.user_id = $1
          AND a.account_type = 'wallet'
        GROUP BY a.id
        ORDER BY a.created_at, a.id
      `,
      [userId],
    );

    return rows;
  }

  // Locks the account row until the transaction ends. Postings must lock the
  // same rows, so a status change and a posting can never interleave.
  async findStatusForUpdate(
    executor: Queryable,
    id: string,
  ): Promise<AccountStatus | null> {
    const { rows } = await executor.query<{ status: AccountStatus }>(
      `
        SELECT status
        FROM accounts
        WHERE id = $1
          AND account_type = 'wallet'
        FOR UPDATE
      `,
      [id],
    );

    return rows[0]?.status ?? null;
  }

  async isBalanceZero(executor: Queryable, id: string): Promise<boolean> {
    const { rows } = await executor.query<{ is_zero: boolean }>(
      `
        SELECT COALESCE(SUM(amount), 0) = 0 AS is_zero
        FROM ledger_entries
        WHERE account_id = $1
      `,
      [id],
    );

    return rows[0].is_zero;
  }

  async updateStatus(
    executor: Queryable,
    id: string,
    status: AccountStatus,
  ): Promise<void> {
    await executor.query(
      `
        UPDATE accounts
        SET status = $2, updated_at = NOW()
        WHERE id = $1
          AND account_type = 'wallet'
      `,
      [id, status],
    );
  }

  async findStatement(
    accountId: string,
    cursor: KeysetCursor | null,
    limit: number,
  ): Promise<StatementEntryRow[]> {
    const { rows } = await this.db.query<StatementEntryRow>(
      `
        WITH statement AS (
          SELECT
            le.id AS entry_id,
            le.ledger_transaction_id,
            lt.operation_id,
            fo.type AS operation_type,
            le.amount,
            SUM(le.amount) OVER (ORDER BY le.created_at, le.id) AS balance_after,
            le.created_at
          FROM ledger_entries le
          JOIN ledger_transactions lt
            ON lt.id = le.ledger_transaction_id
          JOIN financial_operations fo
            ON fo.id = lt.operation_id
          WHERE le.account_id = $1
        )
        SELECT
          s.entry_id,
          s.operation_id,
          s.operation_type,
          s.amount::NUMERIC(19, 2) AS amount,
          s.balance_after::NUMERIC(19, 2) AS balance_after,
          -- Only transfers have a customer counterparty; other operations
          -- would expose a settlement account id
          CASE WHEN s.operation_type = 'transfer' THEN (
            SELECT other.account_id
            FROM ledger_entries other
            WHERE other.ledger_transaction_id = s.ledger_transaction_id
              AND other.account_id <> $1
            LIMIT 1
          ) END AS counterparty_account_id,
          s.created_at,
          s.created_at::TEXT AS cursor_created_at
        FROM statement s
        WHERE $2::TIMESTAMPTZ IS NULL
           OR (s.created_at, s.entry_id) < ($2::TIMESTAMPTZ, $3::UUID)
        ORDER BY s.created_at DESC, s.entry_id DESC
        LIMIT $4
      `,
      [accountId, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
    );

    return rows;
  }
}
