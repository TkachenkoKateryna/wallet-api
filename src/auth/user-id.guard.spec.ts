import {
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { UsersService } from '../users/users.service.js';
import { AuthenticatedRequest, UserIdGuard } from './user-id.guard.js';

const USER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

function contextFor(headerValue: string | undefined) {
  const request = {
    header: vi.fn(() => headerValue),
  } as unknown as AuthenticatedRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { request, context };
}

describe('UserIdGuard', () => {
  let usersService: { findOne: ReturnType<typeof vi.fn> };
  let guard: UserIdGuard;

  beforeEach(() => {
    usersService = { findOne: vi.fn() };
    guard = new UserIdGuard(usersService as unknown as UsersService);
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not-a-uuid'],
  ])('rejects a %s header with 401', async (_label, value) => {
    const { context } = contextFor(value);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usersService.findOne).not.toHaveBeenCalled();
  });

  it('rejects an unknown user with 401', async () => {
    usersService.findOne.mockRejectedValue(new NotFoundException());
    const { context } = contextFor(USER_ID);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('stores the user id on the request', async () => {
    usersService.findOne.mockResolvedValue({ id: USER_ID });
    const { request, context } = contextFor(USER_ID);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.userId).toBe(USER_ID);
  });
});
