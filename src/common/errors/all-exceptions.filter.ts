import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseError } from 'pg';
import { AppError } from './app-error.js';
import type { ErrorCode } from './error-codes.js';
import {
  isRetryable,
  tryAgainError,
  UNIQUE_VIOLATION,
} from './postgres-errors.js';

// Unique constraints whose violation is a client error, not a bug. This is
// the only place they are mapped: services let the database error through.
const UNIQUE_VIOLATIONS: Record<string, [ErrorCode, string]> = {
  users_email_key: ['EMAIL_TAKEN', 'This email is already registered'],
  uq_accounts_user_currency: [
    'WALLET_EXISTS',
    'You already have a wallet in this currency',
  ],
  uq_withdrawals_provider_reference: [
    'DUPLICATE_REFERENCE',
    'This reference has already been used for another withdrawal',
  ],
};

// Turns every error into the PRD §7 body: { statusCode, code, message }.
// Raw database errors never reach the client.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const error = this.toHttpException(exception);

    response.status(error.getStatus()).json(error.getResponse());
  }

  private toHttpException(exception: unknown): HttpException {
    if (exception instanceof AppError) {
      return exception;
    }

    if (exception instanceof DatabaseError) {
      const mapped = this.fromDatabaseError(exception);

      if (mapped) {
        return mapped;
      }
    } else if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    this.logger.error(
      exception instanceof Error
        ? (exception.stack ?? exception.message)
        : exception,
    );

    return new HttpException(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  private fromDatabaseError(error: DatabaseError): AppError | null {
    // The idempotency-key violation is not mapped here: the posting service
    // will handle it by returning the original operation.
    const unique =
      error.code === UNIQUE_VIOLATION && error.constraint
        ? UNIQUE_VIOLATIONS[error.constraint]
        : undefined;

    if (unique) {
      return new AppError(...unique);
    }

    // Outside db.transaction(), which retries these itself
    if (isRetryable(error)) {
      this.logger.warn(
        `Transient database error ${error.code}: ${error.message}`,
      );

      return tryAgainError();
    }

    return null;
  }

  private fromHttpException(exception: HttpException): HttpException {
    if (exception instanceof BadRequestException) {
      const messages = this.messagesOf(exception);

      return new AppError(
        'VALIDATION_ERROR',
        messages[0] ?? 'Invalid request',
        messages,
      );
    }

    switch (exception.getStatus()) {
      case HttpStatus.UNAUTHORIZED:
        return new AppError('UNAUTHORIZED', exception.message);
      case HttpStatus.NOT_FOUND:
        return new AppError('NOT_FOUND', exception.message);
      default:
        return exception;
    }
  }

  // ValidationPipe puts a string[] in `message`; other pipes put a string.
  private messagesOf(exception: HttpException): string[] {
    const body = exception.getResponse();
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? body.message
        : body;

    if (Array.isArray(message)) {
      return message.filter((m): m is string => typeof m === 'string');
    }

    return typeof message === 'string' ? [message] : [];
  }
}
