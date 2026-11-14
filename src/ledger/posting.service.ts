import { Injectable } from '@nestjs/common';
import type { Currency } from '../accounts/accounts.constants.js';
import { toCents } from '../common/money/money.js';
import type { Queryable } from '../database/database.types.js';
import { LedgerRepository } from './ledger.repository.js';
import type { LockedAccount, PostingInput } from './ledger.types.js';

@Injectable()
export class PostingService {
  constructor(private readonly ledger: LedgerRepository) {}

  // Locks in id order (prevents deadlocks); returns in the order of `ids`,
  // so `const [wallet, settlement] = await lockAccounts(...)` is safe.
  async lockAccounts(
    client: Queryable,
    ids: string[],
  ): Promise<LockedAccount[]> {
    const rows = await this.ledger.lockAccounts(client, [...new Set(ids)]);
    const byId = new Map(rows.map((a) => [a.id, a]));
    const missing = ids.filter((id) => !byId.has(id));

    if (missing.length > 0) {
      throw new Error(
        `Accounts not found: ${[...new Set(missing)].join(', ')}`,
      );
    }

    return ids.map((id) => {
      const account = byId.get(id);

      // Unreachable: every id was checked above
      if (!account) {
        throw new Error(`Account ${id} not found`);
      }

      return account;
    });
  }

  // Only reliable after lockAccounts in the same transaction
  getBalance(client: Queryable, accountId: string): Promise<string> {
    return this.ledger.getBalance(client, accountId);
  }

  async getSettlementId(
    client: Queryable,
    currency: Currency,
  ): Promise<string> {
    const id = await this.ledger.findSettlementId(client, currency);

    if (!id) {
      throw new Error(
        `No ${currency} settlement account (is migration 0013 applied?)`,
      );
    }

    return id;
  }

  // Must run inside db.transaction(), with the wallets already locked.
  // Returns the ledger transaction id.
  async post(client: Queryable, input: PostingInput): Promise<string> {
    const { operationId, entries } = input;

    if (entries.length < 2) {
      throw new Error(
        `Operation ${operationId}: a posting needs at least 2 entries`,
      );
    }

    const accountIds = entries.map((e) => e.accountId);

    if (new Set(accountIds).size !== accountIds.length) {
      throw new Error(`Operation ${operationId}: an account appears twice`);
    }

    let sum = 0n;
    for (const entry of entries) {
      const cents = toCents(entry.amount);

      if (cents === 0n) {
        throw new Error(`Operation ${operationId}: zero amount entry`);
      }

      sum += cents;
    }

    if (sum !== 0n) {
      throw new Error(`Operation ${operationId}: entries do not sum to 0`);
    }

    const accounts = await this.ledger.findCurrencies(client, accountIds);

    if (accounts.length !== accountIds.length) {
      throw new Error(`Operation ${operationId}: unknown account in entries`);
    }

    if (new Set(accounts.map((a) => a.currency)).size !== 1) {
      throw new Error(`Operation ${operationId}: entries mix currencies`);
    }

    if (!(await this.ledger.markPosted(client, operationId))) {
      throw new Error(`Operation ${operationId} is not pending`);
    }

    const transactionId = await this.ledger.insertTransaction(
      client,
      operationId,
      input.description ?? null,
    );
    await this.ledger.insertEntries(client, transactionId, entries);

    return transactionId;
  }
}
