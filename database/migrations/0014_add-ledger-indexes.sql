-- Up Migration

-- Joins from a ledger transaction to its entries (statement counterparty, reconciliation)
CREATE INDEX idx_ledger_entries_ledger_transaction_id
    ON ledger_entries (ledger_transaction_id);

-- A wallet's entries in order: balance and keyset-paginated statement
CREATE INDEX idx_ledger_entries_account_created_id
    ON ledger_entries (account_id, created_at, id);

-- Down Migration

DROP INDEX idx_ledger_entries_account_created_id;

DROP INDEX idx_ledger_entries_ledger_transaction_id;
