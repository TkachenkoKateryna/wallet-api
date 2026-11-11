import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './keyset-cursor.js';

describe('keyset cursor', () => {
  const cursor = {
    createdAt: '2026-08-15 10:00:00.123456+00',
    id: '7d1f3c2a-4b5e-4c6d-8e7f-9a0b1c2d3e4f',
  };

  it('round-trips with microsecond precision', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ['not base64 JSON', 'not-a-cursor'],
    [
      'a bad timestamp',
      encodeCursor({ ...cursor, createdAt: '2026-08-15; DROP TABLE x' }),
    ],
    [
      'an impossible month',
      encodeCursor({ ...cursor, createdAt: '2026-99-15 10:00:00+00' }),
    ],
    [
      'an impossible day',
      encodeCursor({ ...cursor, createdAt: '2026-02-31 10:00:00+00' }),
    ],
    [
      'an impossible hour',
      encodeCursor({ ...cursor, createdAt: '2026-08-15 25:00:00+00' }),
    ],
    [
      'an impossible offset',
      encodeCursor({ ...cursor, createdAt: '2026-08-15 10:00:00+99' }),
    ],
    ['a bad id', encodeCursor({ ...cursor, id: '42' })],
    ['missing fields', Buffer.from('{}').toString('base64url')],
  ])('rejects %s', (_label, value) => {
    expect(() => decodeCursor(value)).toThrow(BadRequestException);
  });
});
