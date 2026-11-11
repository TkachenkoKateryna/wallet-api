import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

export interface KeysetCursor {
  createdAt: string;
  id: string;
}

// PostgreSQL's text form of a timestamptz, e.g. 2026-08-15 10:00:00.123456+00
const PG_TIMESTAMPTZ =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;

// createdAt is kept as PostgreSQL text because a JS Date drops microseconds,
// which would skip or repeat rows at page boundaries.
export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(value: string): KeysetCursor {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid cursor');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('createdAt' in parsed) ||
    !('id' in parsed) ||
    typeof parsed.createdAt !== 'string' ||
    typeof parsed.id !== 'string' ||
    !PG_TIMESTAMPTZ.test(parsed.createdAt) ||
    !isUUID(parsed.id)
  ) {
    throw new BadRequestException('Invalid cursor');
  }

  return { createdAt: parsed.createdAt, id: parsed.id };
}
