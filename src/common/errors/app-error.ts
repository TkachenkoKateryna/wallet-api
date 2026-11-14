import { HttpException } from '@nestjs/common';
import { type ErrorCode, STATUS } from './error-codes.js';

export interface AppErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: string[];
}

export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    details?: string[],
  ) {
    const body: AppErrorBody = {
      statusCode: STATUS[code],
      code,
      message,
      ...(details && { details }),
    };

    super(body, STATUS[code]);
  }
}
