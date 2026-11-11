import type { Currency } from './accounts.constants.js';

export type AccountStatus = 'active' | 'frozen' | 'closed';

export interface AccountRow {
  id: string;
  user_id: string;
  currency: Currency;
  status: AccountStatus;
  balance: string;
  created_at: Date;
  updated_at: Date;
}

export interface StatementEntryRow {
  entry_id: string;
  operation_id: string;
  operation_type: string;
  amount: string;
  balance_after: string;
  counterparty_account_id: string | null;
  created_at: Date;
  // created_at as text with full microsecond precision, for the pagination cursor
  cursor_created_at: string;
}
