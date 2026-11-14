import { DatabaseError } from 'pg';
import { AppError } from './app-error.js';

export const UNIQUE_VIOLATION = '23505';

// Deadlock, serialization failure: running the transaction again can succeed
const RETRYABLE_SQLSTATES = new Set(['40P01', '40001']);

export function isRetryable(error: unknown): error is DatabaseError {
  return (
    error instanceof DatabaseError &&
    error.code !== undefined &&
    RETRYABLE_SQLSTATES.has(error.code)
  );
}

export function tryAgainError(): AppError {
  return new AppError('TRY_AGAIN', 'The server was busy. Try again.');
}
