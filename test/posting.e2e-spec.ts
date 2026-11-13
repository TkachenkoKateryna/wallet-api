import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { DatabaseService } from './../src/database/database.service.js';
import { PostingService } from './../src/ledger/posting.service.js';

describe('PostingService (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let posting: PostingService;
  let userId: string;
  let walletA: string;
  let walletB: string;
  let settlementId: string;
  const operationIds: string[] = [];

  async function createPendingDeposit(): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `
        INSERT INTO financial_operations (type, idempotency_key)
        VALUES ('deposit', $1)
        RETURNING id
      `,
      [`posting-e2e-${randomUUID()}`],
    );
    operationIds.push(rows[0].id);

    return rows[0].id;
  }

  async function operationState(operationId: string) {
    const { rows } = await db.query<{ status: string; transactions: number }>(
      `
        SELECT
          fo.status,
          (SELECT COUNT(*)::INT FROM ledger_transactions lt
           WHERE lt.operation_id = fo.id) AS transactions
        FROM financial_operations fo
        WHERE fo.id = $1
      `,
      [operationId],
    );

    return rows[0];
  }

  const balanceOf = (accountId: string) =>
    db.transaction((client) => posting.getBalance(client, accountId));

  // Locks the wallets, then posts a deposit into `walletId`
  const deposit = (operationId: string, walletId: string, amount: string) =>
    db.transaction(async (client) => {
      await posting.lockAccounts(client, [walletId, settlementId]);

      return posting.post(client, {
        operationId,
        description: 'posting e2e',
        entries: [
          { accountId: walletId, amount },
          { accountId: settlementId, amount: `-${amount}` },
        ],
      });
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    db = app.get(DatabaseService);
    posting = app.get(PostingService);

    const user = await db.query<{ id: string }>(
      `INSERT INTO users (email, name) VALUES ($1, 'Posting E2E') RETURNING id`,
      [`posting-e2e-${randomUUID()}@example.com`],
    );
    userId = user.rows[0].id;

    // Wallets in two currencies would break uq_accounts_user_currency for
    // the same user, so the second wallet is EUR
    const wallets = await db.query<{ id: string }>(
      `
        INSERT INTO accounts (user_id, account_type, currency)
        VALUES ($1, 'wallet', 'USD'), ($1, 'wallet', 'EUR')
        RETURNING id
      `,
      [userId],
    );
    [walletA, walletB] = wallets.rows.map((r) => r.id);

    settlementId = await db.transaction((client) =>
      posting.getSettlementId(client, 'USD'),
    );
  });

  afterAll(async () => {
    if (db) {
      await db.query(
        `
          DELETE FROM ledger_entries
          WHERE ledger_transaction_id IN (
            SELECT id FROM ledger_transactions WHERE operation_id = ANY($1::UUID[])
          )
        `,
        [operationIds],
      );
      await db.query(
        'DELETE FROM ledger_transactions WHERE operation_id = ANY($1::UUID[])',
        [operationIds],
      );
      await db.query(
        'DELETE FROM financial_operations WHERE id = ANY($1::UUID[])',
        [operationIds],
      );
      await db.query('DELETE FROM accounts WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await app?.close();
  });

  it('posts a balanced deposit and marks the operation posted', async () => {
    const operationId = await createPendingDeposit();

    const transactionId = await deposit(operationId, walletA, '100.00');

    const { rows } = await db.query<{ account_id: string; amount: string }>(
      `
        SELECT account_id, amount::NUMERIC(19, 2) AS amount
        FROM ledger_entries
        WHERE ledger_transaction_id = $1
        ORDER BY amount DESC
      `,
      [transactionId],
    );
    expect(rows).toEqual([
      { account_id: walletA, amount: '100.00' },
      { account_id: settlementId, amount: '-100.00' },
    ]);
    expect(await operationState(operationId)).toEqual({
      status: 'posted',
      transactions: 1,
    });
    expect(await balanceOf(walletA)).toBe('100.00');
  });

  it('rejects an unbalanced posting and saves nothing', async () => {
    const operationId = await createPendingDeposit();
    const before = await balanceOf(walletA);

    await expect(
      db.transaction(async (client) => {
        await posting.lockAccounts(client, [walletA, settlementId]);
        return posting.post(client, {
          operationId,
          entries: [
            { accountId: walletA, amount: '100.00' },
            { accountId: settlementId, amount: '-90.00' },
          ],
        });
      }),
    ).rejects.toThrow('do not sum to 0');

    expect(await operationState(operationId)).toEqual({
      status: 'pending',
      transactions: 0,
    });
    expect(await balanceOf(walletA)).toBe(before);
  });

  it('saves nothing when the transaction fails after posting', async () => {
    const operationId = await createPendingDeposit();
    const before = await balanceOf(walletA);

    await expect(
      db.transaction(async (client) => {
        await posting.lockAccounts(client, [walletA, settlementId]);
        await posting.post(client, {
          operationId,
          entries: [
            { accountId: walletA, amount: '25.00' },
            { accountId: settlementId, amount: '-25.00' },
          ],
        });
        throw new Error('fails after the posting');
      }),
    ).rejects.toThrow('fails after the posting');

    expect(await operationState(operationId)).toEqual({
      status: 'pending',
      transactions: 0,
    });
    expect(await balanceOf(walletA)).toBe(before);
  });

  it('refuses to post an operation twice', async () => {
    const operationId = await createPendingDeposit();
    await deposit(operationId, walletA, '10.00');

    await expect(deposit(operationId, walletA, '10.00')).rejects.toThrow(
      'is not pending',
    );
    expect(await operationState(operationId)).toEqual({
      status: 'posted',
      transactions: 1,
    });
  });

  it('rejects entries in two currencies', async () => {
    const operationId = await createPendingDeposit();

    await expect(
      db.transaction(async (client) => {
        await posting.lockAccounts(client, [walletA, walletB]);
        return posting.post(client, {
          operationId,
          entries: [
            { accountId: walletA, amount: '5.00' },
            { accountId: walletB, amount: '-5.00' },
          ],
        });
      }),
    ).rejects.toThrow('mix currencies');
    expect(await operationState(operationId)).toEqual({
      status: 'pending',
      transactions: 0,
    });
  });

  it('locks in id order, whatever order callers list the accounts in', async () => {
    const runs = Array.from({ length: 10 }, (_, i) =>
      db.transaction(async (client) => {
        const ids = i % 2 === 0 ? [walletA, walletB] : [walletB, walletA];
        const locked = await posting.lockAccounts(client, ids);
        // Hold both locks long enough for the others to queue up behind them
        await client.query('SELECT pg_sleep(0.02)');

        return locked.map((a) => a.id);
      }),
    );

    const results = await Promise.all(runs);

    // Always locked, and returned, in id order
    const sorted = [walletA, walletB].sort();
    for (const ids of results) {
      expect(ids).toEqual(sorted);
    }
  });

  // Runs last, while this file's postings still exist. Same checks as
  // database/validation/check.sh: every query must return zero rows.
  it.each(['01_ledger_balance', '02_posted_operations'])(
    'leaves %s with 0 violations',
    async (check) => {
      const sql = readFileSync(`database/validation/${check}.sql`, 'utf8');
      // No parameters, so pg sends it as a simple query: every statement runs,
      // and a multi-statement file returns one result per statement
      const result: unknown = await db.query(sql);
      const results = (Array.isArray(result) ? result : [result]) as {
        rows: unknown[];
      }[];

      expect(results.flatMap((r) => r.rows)).toEqual([]);
    },
  );
});
