import { Injectable } from '@nestjs/common';
import { AppError } from '../common/errors/app-error.js';
import { UsersRepository } from './users.repository.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import type { User } from './users.types.js';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  // A duplicate email fails on users_email_key; the global filter maps it
  // to EMAIL_TAKEN
  create(dto: CreateUserDto): Promise<User> {
    return this.usersRepository.create(dto);
  }

  findAll(): Promise<User[]> {
    return this.usersRepository.findAll();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new AppError('NOT_FOUND', 'User not found');
    }

    return user;
  }
}
