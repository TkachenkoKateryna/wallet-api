import { Injectable } from '@nestjs/common';
import { DatabaseError } from 'pg';
import { AppError } from '../common/errors/app-error.js';
import { UsersRepository } from './users.repository.js';
import { CreateUserDto } from './dto/create-user.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(dto: CreateUserDto) {
    try {
      return await this.usersRepository.create(dto);
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        error.code === '23505' &&
        error.constraint === 'users_email_key'
      ) {
        throw new AppError('EMAIL_TAKEN', 'Email already exists');
      }

      throw error;
    }
  }

  async findAll() {
    return this.usersRepository.findAll();
  }

  async findOne(id: string) {
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new AppError('NOT_FOUND', 'User not found');
    }

    return user;
  }
}
