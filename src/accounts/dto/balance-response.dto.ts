import type { Currency } from '../accounts.constants.js';

export interface BalanceResponse {
  account_id: string;
  currency: Currency;
  balance: string;
}
