import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { CreateUserData, User } from './users.types.js';

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(data: CreateUserData): Promise<User> {
    const { rows } = await this.db.query<User>(
      `
        INSERT INTO users (email, name, phone)
        VALUES ($1, $2, $3)
        RETURNING
          id, email, name, phone,
          created_at, updated_at
      `,
      [data.email, data.name, data.phone ?? null],
    );

    return rows[0];
  }

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.db.query<User>(
      `
        SELECT
          id, email, name, phone,
          created_at, updated_at
        FROM users
        WHERE id = $1
      `,
      [id],
    );

    return rows[0] ?? null;
  }

  async findAll(): Promise<User[]> {
    const { rows } = await this.db.query<User>(
      `
        SELECT
          id, email, name, phone,
          created_at, updated_at
        FROM users
        ORDER BY created_at DESC, id DESC
      `,
    );

    return rows;
  }
}
