-- Up Migration

CREATE TABLE transfers (
    operation_id UUID PRIMARY KEY REFERENCES financial_operations (id),
    source_account_id UUID NOT NULL REFERENCES accounts (id),
    destination_account_id UUID NOT NULL REFERENCES accounts (id),
    amount NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    note VARCHAR(255),
    CHECK (source_account_id <> destination_account_id)
);

-- Down Migration

DROP TABLE transfers;
