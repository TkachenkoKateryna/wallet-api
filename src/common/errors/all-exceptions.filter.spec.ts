import {
  type ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
  ParseUUIDPipe,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseError } from 'pg';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { AppError } from './app-error.js';

function databaseError(code: string, constraint?: string): DatabaseError {
  const error = new DatabaseError('raw driver message', 0, 'error');
  error.code = code;
  error.constraint = constraint;
  return error;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let response: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let host: ArgumentsHost;
  let logError: ReturnType<typeof vi.spyOn>;
  let logWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    logWarn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function send(exception: unknown) {
    filter.catch(exception, host);

    return {
      status: response.status.mock.calls[0][0] as number,
      body: response.json.mock.calls[0][0] as Record<string, unknown>,
    };
  }

  it('sends an AppError body as is', () => {
    expect(send(new AppError('INSUFFICIENT_FUNDS', 'Not enough'))).toEqual({
      status: 422,
      body: {
        statusCode: 422,
        code: 'INSUFFICIENT_FUNDS',
        message: 'Not enough',
      },
    });
  });

  it('maps ValidationPipe errors to VALIDATION_ERROR with details', () => {
    const exception = new BadRequestException([
      'currency must be one of USD, EUR',
      'property balance should not exist',
    ]);

    expect(send(exception)).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'currency must be one of USD, EUR',
        details: [
          'currency must be one of USD, EUR',
          'property balance should not exist',
        ],
      },
    });
  });

  it('maps a single-message 400 (ParseUUIDPipe) to VALIDATION_ERROR', async () => {
    const error = await new ParseUUIDPipe()
      .transform('nope', { type: 'param' })
      .catch((e: unknown) => e);

    const { status, body } = send(error);

    expect(status).toBe(400);
    expect(body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [body.message],
    });
  });

  it.each([
    [new UnauthorizedException('Unknown user'), 401, 'UNAUTHORIZED'],
    [new NotFoundException('Cannot GET /nope'), 404, 'NOT_FOUND'],
  ])('maps a plain %s by status', (exception, status, code) => {
    expect(send(exception)).toEqual({
      status,
      body: { statusCode: status, code, message: exception.message },
    });
  });

  it('keeps other framework errors as Nest sent them', () => {
    const exception = new PayloadTooLargeException();

    expect(send(exception)).toEqual({
      status: 413,
      body: exception.getResponse(),
    });
  });

  it.each([
    ['uq_accounts_user_currency', 409, 'WALLET_EXISTS'],
    ['uq_withdrawals_provider_reference', 409, 'DUPLICATE_REFERENCE'],
  ])('maps a unique violation on %s', (constraint, status, code) => {
    const { status: sent, body } = send(databaseError('23505', constraint));

    expect(sent).toBe(status);
    expect(body).toMatchObject({ statusCode: status, code });
  });

  it.each(['40P01', '40001'])('maps SQLSTATE %s to TRY_AGAIN', (sqlstate) => {
    const { status, body } = send(databaseError(sqlstate));

    expect(status).toBe(503);
    expect(body).toMatchObject({ code: 'TRY_AGAIN' });
    expect(logWarn).toHaveBeenCalled();
  });

  it.each([
    ['an unmapped unique violation', databaseError('23505', 'uq_other')],
    ['another database error', databaseError('22P02')],
    ['a plain Error', new Error('raw driver message')],
    ['a non-Error value', 'raw driver message'],
  ])('hides %s behind a logged 500', (_label, exception) => {
    const { status, body } = send(exception);

    expect(status).toBe(500);
    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(JSON.stringify(body)).not.toContain('raw driver message');
    expect(logError).toHaveBeenCalled();
  });
});
