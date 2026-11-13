import { Logger } from '@nestjs/common';
import { DatabaseError, type Pool, type PoolClient } from 'pg';
import { AppError } from '../common/errors/app-error.js';
import { DatabaseService } from './database.service.js';

function databaseError(code: string): DatabaseError {
  const error = new DatabaseError('deadlock detected', 0, 'error');
  error.code = code;
  return error;
}

describe('DatabaseService.transaction', () => {
  let client: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  let pool: { connect: ReturnType<typeof vi.fn> };
  let service: DatabaseService;

  beforeEach(() => {
    client = { query: vi.fn().mockResolvedValue({}), release: vi.fn() };
    pool = { connect: vi.fn().mockResolvedValue(client) };
    service = new DatabaseService(pool as unknown as Pool);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const statements = () =>
    client.query.mock.calls.map(([sql]) => sql as string);

  it('retries a deadlock from the start and returns the result', async () => {
    const callback = vi
      .fn<(c: PoolClient) => Promise<string>>()
      .mockRejectedValueOnce(databaseError('40P01'))
      .mockRejectedValueOnce(databaseError('40P01'))
      .mockResolvedValueOnce('done');

    await expect(service.transaction(callback)).resolves.toBe('done');

    expect(callback).toHaveBeenCalledTimes(3);
    expect(statements()).toEqual([
      'BEGIN',
      'ROLLBACK',
      'BEGIN',
      'ROLLBACK',
      'BEGIN',
      'COMMIT',
    ]);
    expect(pool.connect).toHaveBeenCalledTimes(3);
    expect(client.release).toHaveBeenCalledTimes(3);
  });

  it('retries a serialization failure raised by COMMIT', async () => {
    client.query.mockImplementation((sql: string) =>
      sql === 'COMMIT' && client.query.mock.calls.length <= 3
        ? Promise.reject(databaseError('40001'))
        : Promise.resolve({}),
    );
    const callback = vi.fn().mockResolvedValue('done');

    await expect(service.transaction(callback)).resolves.toBe('done');
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('throws TRY_AGAIN after 3 failed attempts', async () => {
    const callback = vi.fn().mockRejectedValue(databaseError('40P01'));

    const error = await service.transaction(callback).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'TRY_AGAIN' });
    expect(callback).toHaveBeenCalledTimes(3);
    expect(client.release).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['a unique violation', databaseError('23505')],
    ['an AppError', new AppError('WALLET_NOT_ACTIVE', 'Frozen')],
    ['a plain Error', new Error('boom')],
  ])('throws %s at once without retrying', async (_label, thrown) => {
    const callback = vi.fn().mockRejectedValue(thrown);

    await expect(service.transaction(callback)).rejects.toBe(thrown);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(statements()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('does not retry when it cannot connect', async () => {
    const thrown = new Error('connect ECONNREFUSED');
    pool.connect.mockRejectedValue(thrown);
    const callback = vi.fn();

    await expect(service.transaction(callback)).rejects.toBe(thrown);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it('discards the connection when ROLLBACK fails, and retries on a new one', async () => {
    const broken = {
      query: vi.fn((sql: string) =>
        sql === 'ROLLBACK'
          ? Promise.reject(new Error('connection lost'))
          : Promise.resolve({}),
      ),
      release: vi.fn(),
    };
    pool.connect.mockResolvedValueOnce(broken).mockResolvedValue(client);
    const callback = vi
      .fn()
      .mockRejectedValueOnce(databaseError('40P01'))
      .mockResolvedValueOnce('done');

    await expect(service.transaction(callback)).resolves.toBe('done');
    expect(broken.release).toHaveBeenCalledWith(true);
    expect(client.release).toHaveBeenCalledWith(false);
  });
});
