import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

export interface KeysetCursor {
  createdAt: string;
  id: string;
}

// PostgreSQL's text form of a timestamptz, e.g. 2026-08-15 10:00:00.123456+00
const PG_TIMESTAMPTZ =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;

// The value is bound to a TIMESTAMPTZ parameter, and PostgreSQL fails the whole
// query on an impossible date. Reject those here so the client gets a 400.
function isPgTimestamptz(value: string): boolean {
  if (!PG_TIMESTAMPTZ.test(value)) {
    return false;
  }

  // Date.parse covers the time and offset ranges, but it rolls an impossible
  // day over (Feb 31 becomes Mar 3), so the calendar day is checked separately.
  const iso = value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');

  if (Number.isNaN(Date.parse(iso))) {
    return false;
  }

  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

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
    !isPgTimestamptz(parsed.createdAt) ||
    !isUUID(parsed.id)
  ) {
    throw new BadRequestException('Invalid cursor');
  }

  return { createdAt: parsed.createdAt, id: parsed.id };
}
