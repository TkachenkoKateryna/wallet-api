// Must match the chk_accounts_currency constraint
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'UAH'] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const STATEMENT_DEFAULT_LIMIT = 50;
export const STATEMENT_MAX_LIMIT = 100;
