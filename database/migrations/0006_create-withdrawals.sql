-- Up Migration

CREATE TABLE withdrawals (
    operation_id UUID PRIMARY KEY REFERENCES financial_operations (id),
    account_id UUID NOT NULL REFERENCES accounts (id),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts (id),
    amount NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    provider_reference VARCHAR(255),
    note VARCHAR(255)
);

-- Down Migration

DROP TABLE withdrawals;
