import type { Currency } from '../accounts/accounts.constants.js';
import type { AccountStatus } from '../accounts/accounts.types.js';

export interface LedgerEntryInput {
  accountId: string;
  // Signed decimal string: negative = debit, positive = credit
  amount: string;
}

export interface PostingInput {
  operationId: string;
  description?: string;
  entries: LedgerEntryInput[];
}

export interface LockedAccount {
  id: string;
  accountType: 'wallet' | 'system';
  currency: Currency;
  status: AccountStatus;
}
