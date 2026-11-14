import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { AppError } from '../common/errors/app-error.js';
import { UsersService } from '../users/users.service.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

// Simulated authentication: the caller is the user named in the X-User-Id header.
// Replace with a real auth guard (e.g. JWT) without changing the controllers.
@Injectable()
export class UserIdGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.header('x-user-id');

    if (!userId || !isUUID(userId)) {
      throw new AppError('UNAUTHORIZED', 'X-User-Id header must be a user id');
    }

    try {
      await this.usersService.findOne(userId);
    } catch (error) {
      if (error instanceof AppError && error.code === 'NOT_FOUND') {
        throw new AppError('UNAUTHORIZED', 'Unknown user');
      }

      throw error;
    }

    request.userId = userId;

    return true;
  }
}
