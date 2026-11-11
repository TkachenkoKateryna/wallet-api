export interface StatementEntryResponse {
  entry_id: string;
  operation_id: string;
  operation_type: string;
  amount: string;
  balance_after: string;
  counterparty_account_id: string | null;
  created_at: Date;
}

export interface StatementResponse {
  items: StatementEntryResponse[];
  next_cursor: string | null;
}
