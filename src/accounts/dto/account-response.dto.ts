import type { Currency } from '../accounts.constants.js';
import type { AccountRow, AccountStatus } from '../accounts.types.js';

export class AccountResponseDto {
  id: string;
  user_id: string;
  currency: Currency;
  status: AccountStatus;
  balance: string;
  created_at: Date;
  updated_at: Date;

  static from(row: AccountRow): AccountResponseDto {
    const dto = new AccountResponseDto();
    dto.id = row.id;
    dto.user_id = row.user_id;
    dto.currency = row.currency;
    dto.status = row.status;
    dto.balance = row.balance;
    dto.created_at = row.created_at;
    dto.updated_at = row.updated_at;

    return dto;
  }
}
