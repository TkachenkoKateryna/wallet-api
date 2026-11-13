import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request, { type Response } from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { DatabaseService } from './../src/database/database.service.js';

describe('Accounts (e2e)', () => {
  let app: INestApplication<App>;
  let db: DatabaseService;
  let userA: string;
  let userB: string;
  let accountA: string;

  const as = (userId: string) => ({ 'X-User-Id': userId });

  // Every error carries the PRD §7 body: { statusCode, code, message }
  const expectError =
    (status: number, code: string) =>
    (response: Response): void => {
      expect(response.status).toBe(status);
      expect(response.body).toMatchObject({ statusCode: status, code });
      expect(typeof response.body.message).toBe('string');
    };

  async function createUser(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/users')
      .send({ email: `accounts-e2e-${randomUUID()}@example.com`, name: 'E2E' })
      .expect(201);

    return response.body.id;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    db = app.get(DatabaseService);
    userA = await createUser();
    userB = await createUser();
  });

  afterAll(async () => {
    const users = [userA, userB].filter(Boolean);
    await db.query('DELETE FROM accounts WHERE user_id = ANY($1::UUID[])', [
      users,
    ]);
    await db.query('DELETE FROM users WHERE id = ANY($1::UUID[])', [users]);
    await app.close();
  });

  describe('identity', () => {
    it('requires X-User-Id', () =>
      request(app.getHttpServer())
        .get('/accounts')
        .expect(expectError(401, 'UNAUTHORIZED')));

    it('rejects an unknown user', () =>
      request(app.getHttpServer())
        .get('/accounts')
        .set(as(randomUUID()))
        .expect(expectError(401, 'UNAUTHORIZED')));
  });

  describe('opening accounts', () => {
    it('opens an account with a zero balance', async () => {
      const response = await request(app.getHttpServer())
        .post('/accounts')
        .set(as(userA))
        .send({ currency: 'USD' })
        .expect(201);

      expect(response.body).toMatchObject({
        user_id: userA,
        currency: 'USD',
        status: 'active',
        balance: '0.00',
      });
      expect(response.body).not.toHaveProperty('account_type');
      accountA = response.body.id;
    });

    it('allows one account per currency', () =>
      request(app.getHttpServer())
        .post('/accounts')
        .set(as(userA))
        .send({ currency: 'USD' })
        .expect(expectError(409, 'WALLET_EXISTS')));

    it('rejects unsupported currencies', async () => {
      const response = await request(app.getHttpServer())
        .post('/accounts')
        .set(as(userA))
        .send({ currency: 'GBP' })
        .expect(expectError(400, 'VALIDATION_ERROR'));

      expect(response.body.details).toContain(response.body.message);
    });

    it('rejects unknown fields', () =>
      request(app.getHttpServer())
        .post('/accounts')
        .set(as(userA))
        .send({ currency: 'EUR', balance: '1000.00' })
        .expect(expectError(400, 'VALIDATION_ERROR')));
  });

  describe('reading accounts', () => {
    it('lists the caller’s accounts', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts')
        .set(as(userA))
        .expect(200);

      expect(response.body.map((a: { id: string }) => a.id)).toEqual([
        accountA,
      ]);
    });

    it('returns an account and its balance', async () => {
      await request(app.getHttpServer())
        .get(`/accounts/${accountA}`)
        .set(as(userA))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/accounts/${accountA}/balance`)
        .set(as(userA))
        .expect(200);

      expect(response.body).toEqual({
        account_id: accountA,
        currency: 'USD',
        balance: '0.00',
      });
    });

    it.each(['', '/balance', '/transactions'])(
      'hides another user’s account (%s)',
      async (path) => {
        await request(app.getHttpServer())
          .get(`/accounts/${accountA}${path}`)
          .set(as(userB))
          .expect(expectError(404, 'NOT_FOUND'));
      },
    );

    it('hides system accounts', async () => {
      const { rows } = await db.query<{ id: string }>(
        "SELECT id FROM accounts WHERE system_code = 'settlement' LIMIT 1",
      );

      await request(app.getHttpServer())
        .get(`/accounts/${rows[0].id}`)
        .set(as(userA))
        .expect(expectError(404, 'NOT_FOUND'));
      await request(app.getHttpServer())
        .post(`/admin/accounts/${rows[0].id}/freeze`)
        .expect(expectError(404, 'NOT_FOUND'));
    });

    it('rejects a malformed account id', () =>
      request(app.getHttpServer())
        .get('/accounts/not-a-uuid')
        .set(as(userA))
        .expect(expectError(400, 'VALIDATION_ERROR')));
  });

  describe('statement', () => {
    let funded: { id: string; user_id: string };

    beforeAll(async () => {
      const { rows } = await db.query<{ id: string; user_id: string }>(`
        SELECT a.id, a.user_id
        FROM accounts a
        JOIN ledger_entries le ON le.account_id = a.id
        WHERE a.account_type = 'wallet'
        GROUP BY a.id
        HAVING COUNT(*) >= 3
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `);
      funded = rows[0];
    });

    it('is empty for a new account', async () => {
      const response = await request(app.getHttpServer())
        .get(`/accounts/${accountA}/transactions`)
        .set(as(userA))
        .expect(200);

      expect(response.body).toEqual({ items: [], next_cursor: null });
    });

    it('pages through every entry with a running balance', async () => {
      const { body: full } = await request(app.getHttpServer())
        .get(`/accounts/${funded.id}/transactions?limit=100`)
        .set(as(funded.user_id))
        .expect(200);
      const { body: balance } = await request(app.getHttpServer())
        .get(`/accounts/${funded.id}/balance`)
        .set(as(funded.user_id))
        .expect(200);

      // Newest entry carries the current balance
      expect(full.items[0].balance_after).toBe(balance.balance);

      const paged: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `limit=2&cursor=${cursor}` : 'limit=2';
        const response = await request(app.getHttpServer())
          .get(`/accounts/${funded.id}/transactions?${query}`)
          .set(as(funded.user_id))
          .expect(200);

        expect(response.body.items.length).toBeLessThanOrEqual(2);
        paged.push(
          ...response.body.items.map((e: { entry_id: string }) => e.entry_id),
        );
        cursor = response.body.next_cursor;
      } while (cursor);

      expect(paged).toEqual(
        full.items.map((e: { entry_id: string }) => e.entry_id),
      );
    });

    it.each(['limit=0', 'limit=101', 'cursor=garbage'])(
      'rejects %s',
      async (query) => {
        await request(app.getHttpServer())
          .get(`/accounts/${funded.id}/transactions?${query}`)
          .set(as(funded.user_id))
          .expect(expectError(400, 'VALIDATION_ERROR'));
      },
    );
  });

  describe('admin', () => {
    it('lists a user’s accounts', async () => {
      const response = await request(app.getHttpServer())
        .get(`/admin/users/${userA}/accounts`)
        .expect(200);

      expect(response.body).toHaveLength(1);
    });

    it('returns 404 for an unknown user', () =>
      request(app.getHttpServer())
        .get(`/admin/users/${randomUUID()}/accounts`)
        .expect(expectError(404, 'NOT_FOUND')));

    it('freezes, unfreezes and closes an account', async () => {
      const server = app.getHttpServer();

      const frozen = await request(server)
        .post(`/admin/accounts/${accountA}/freeze`)
        .expect(200);
      expect(frozen.body.status).toBe('frozen');
      await request(server)
        .post(`/admin/accounts/${accountA}/freeze`)
        .expect(expectError(422, 'WALLET_NOT_ACTIVE'));

      const active = await request(server)
        .post(`/admin/accounts/${accountA}/unfreeze`)
        .expect(200);
      expect(active.body.status).toBe('active');
      await request(server)
        .post(`/admin/accounts/${accountA}/unfreeze`)
        .expect(expectError(422, 'INVALID_STATUS_TRANSITION'));

      const closed = await request(server)
        .post(`/admin/accounts/${accountA}/close`)
        .expect(200);
      expect(closed.body.status).toBe('closed');
      await request(server)
        .post(`/admin/accounts/${accountA}/close`)
        .expect(expectError(422, 'WALLET_NOT_ACTIVE'));
    });

    it('refuses to close an account with money in it', async () => {
      const { rows } = await db.query<{ id: string }>(`
        SELECT a.id
        FROM accounts a
        JOIN ledger_entries le ON le.account_id = a.id
        WHERE a.account_type = 'wallet' AND a.status = 'active'
        GROUP BY a.id
        HAVING SUM(le.amount) <> 0
        LIMIT 1
      `);

      await request(app.getHttpServer())
        .post(`/admin/accounts/${rows[0].id}/close`)
        .expect(expectError(422, 'WALLET_NOT_EMPTY'));
    });
  });
});
