import type { Queryable } from '../database/database.types.js';
import type { LedgerRepository } from './ledger.repository.js';
import type { LedgerEntryInput, LockedAccount } from './ledger.types.js';
import { PostingService } from './posting.service.js';

const OPERATION_ID = 'a0000000-0000-4000-8000-000000000001';
const WALLET = 'b0000000-0000-4000-8000-000000000001';
const SETTLEMENT = 'b0000000-0000-4000-8000-000000000002';
const EUR_WALLET = 'b0000000-0000-4000-8000-000000000003';
const OTHER_WALLET = 'b0000000-0000-4000-8000-000000000004';
const TX_ID = 'c0000000-0000-4000-8000-000000000001';

function locked(id: string): LockedAccount {
  return { id, accountType: 'wallet', currency: 'USD', status: 'active' };
}

describe('PostingService', () => {
  let ledger: {
    lockAccounts: ReturnType<typeof vi.fn>;
    findCurrencies: ReturnType<typeof vi.fn>;
    getBalance: ReturnType<typeof vi.fn>;
    findSettlementId: ReturnType<typeof vi.fn>;
    insertTransaction: ReturnType<typeof vi.fn>;
    insertEntries: ReturnType<typeof vi.fn>;
    markPosted: ReturnType<typeof vi.fn>;
  };
  let service: PostingService;
  const client = {} as Queryable;

  beforeEach(() => {
    ledger = {
      lockAccounts: vi.fn(),
      findCurrencies: vi.fn((_c: Queryable, ids: string[]) =>
        Promise.resolve(
          ids.map((id) => ({
            id,
            currency: id === EUR_WALLET ? 'EUR' : 'USD',
          })),
        ),
      ),
      getBalance: vi.fn(),
      findSettlementId: vi.fn(),
      insertTransaction: vi.fn().mockResolvedValue(TX_ID),
      insertEntries: vi.fn().mockResolvedValue(undefined),
      markPosted: vi.fn().mockResolvedValue(true),
    };
    service = new PostingService(ledger as unknown as LedgerRepository);
  });

  const deposit: LedgerEntryInput[] = [
    { accountId: WALLET, amount: '100.00' },
    { accountId: SETTLEMENT, amount: '-100.00' },
  ];

  function expectNoWrites() {
    expect(ledger.markPosted).not.toHaveBeenCalled();
    expect(ledger.insertTransaction).not.toHaveBeenCalled();
    expect(ledger.insertEntries).not.toHaveBeenCalled();
  }

  describe('post', () => {
    it('marks the operation posted, then writes the transaction and entries', async () => {
      await expect(
        service.post(client, {
          operationId: OPERATION_ID,
          description: 'Deposit',
          entries: deposit,
        }),
      ).resolves.toBe(TX_ID);

      expect(ledger.findCurrencies).toHaveBeenCalledWith(client, [
        WALLET,
        SETTLEMENT,
      ]);
      expect(ledger.markPosted).toHaveBeenCalledWith(client, OPERATION_ID);
      expect(ledger.insertTransaction).toHaveBeenCalledWith(
        client,
        OPERATION_ID,
        'Deposit',
      );
      expect(ledger.insertEntries).toHaveBeenCalledWith(client, TX_ID, deposit);

      const order = [
        ledger.findCurrencies,
        ledger.markPosted,
        ledger.insertTransaction,
        ledger.insertEntries,
      ].map((fn) => fn.mock.invocationCallOrder[0]);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it('stores a missing description as NULL', async () => {
      await service.post(client, {
        operationId: OPERATION_ID,
        entries: deposit,
      });

      expect(ledger.insertTransaction).toHaveBeenCalledWith(
        client,
        OPERATION_ID,
        null,
      );
    });

    it.each<[string, LedgerEntryInput[], string]>([
      [
        'one entry',
        [{ accountId: WALLET, amount: '0.00' }],
        'at least 2 entries',
      ],
      [
        'a zero amount',
        [
          { accountId: WALLET, amount: '0.00' },
          { accountId: SETTLEMENT, amount: '0' },
        ],
        'zero amount',
      ],
      [
        'three decimals',
        [
          { accountId: WALLET, amount: '1.005' },
          { accountId: SETTLEMENT, amount: '-1.005' },
        ],
        'Invalid amount',
      ],
      [
        'a repeated account',
        [
          { accountId: WALLET, amount: '5.00' },
          { accountId: WALLET, amount: '-5.00' },
        ],
        'appears twice',
      ],
      [
        'an unbalanced sum',
        [
          { accountId: WALLET, amount: '100.00' },
          { accountId: SETTLEMENT, amount: '-99.99' },
        ],
        'do not sum to 0',
      ],
      [
        'mixed currencies',
        [
          { accountId: WALLET, amount: '5.00' },
          { accountId: EUR_WALLET, amount: '-5.00' },
        ],
        'mix currencies',
      ],
    ])('rejects %s without writing', async (_label, entries, message) => {
      await expect(
        service.post(client, { operationId: OPERATION_ID, entries }),
      ).rejects.toThrow(message);
      expectNoWrites();
    });

    it('sums in cents, so 0.10 + 0.20 balances -0.30', async () => {
      await expect(
        service.post(client, {
          operationId: OPERATION_ID,
          entries: [
            { accountId: WALLET, amount: '0.10' },
            { accountId: OTHER_WALLET, amount: '0.20' },
            { accountId: SETTLEMENT, amount: '-0.30' },
          ],
        }),
      ).resolves.toBe(TX_ID);
    });

    it('rejects an unknown account without writing', async () => {
      ledger.findCurrencies.mockResolvedValue([
        { id: WALLET, currency: 'USD' },
      ]);

      await expect(
        service.post(client, { operationId: OPERATION_ID, entries: deposit }),
      ).rejects.toThrow('unknown account');
      expectNoWrites();
    });

    it('throws when the operation is not pending, before inserting', async () => {
      ledger.markPosted.mockResolvedValue(false);

      await expect(
        service.post(client, { operationId: OPERATION_ID, entries: deposit }),
      ).rejects.toThrow('is not pending');
      expect(ledger.insertTransaction).not.toHaveBeenCalled();
      expect(ledger.insertEntries).not.toHaveBeenCalled();
    });
  });

  describe('lockAccounts', () => {
    it('locks each account once', async () => {
      ledger.lockAccounts.mockResolvedValue([
        locked(WALLET),
        locked(SETTLEMENT),
      ]);

      await service.lockAccounts(client, [SETTLEMENT, WALLET, SETTLEMENT]);

      expect(ledger.lockAccounts).toHaveBeenCalledWith(client, [
        SETTLEMENT,
        WALLET,
      ]);
    });

    it('returns accounts in the order they were asked for', async () => {
      // The repository returns rows sorted by id
      ledger.lockAccounts.mockResolvedValue([
        locked(WALLET),
        locked(SETTLEMENT),
      ]);

      const [first, second] = await service.lockAccounts(client, [
        SETTLEMENT,
        WALLET,
      ]);

      expect(first.id).toBe(SETTLEMENT);
      expect(second.id).toBe(WALLET);
    });

    it('throws when an account is missing', async () => {
      ledger.lockAccounts.mockResolvedValue([locked(WALLET)]);

      await expect(
        service.lockAccounts(client, [WALLET, SETTLEMENT]),
      ).rejects.toThrow(`Accounts not found: ${SETTLEMENT}`);
    });
  });

  describe('getSettlementId', () => {
    it('returns the settlement account', async () => {
      ledger.findSettlementId.mockResolvedValue(SETTLEMENT);

      await expect(service.getSettlementId(client, 'USD')).resolves.toBe(
        SETTLEMENT,
      );
    });

    it('throws when there is none', async () => {
      ledger.findSettlementId.mockResolvedValue(null);

      await expect(service.getSettlementId(client, 'UAH')).rejects.toThrow(
        'No UAH settlement account',
      );
    });
  });
});
