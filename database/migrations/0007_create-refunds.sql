-- Up Migration

CREATE TABLE refunds (
    operation_id UUID PRIMARY KEY REFERENCES financial_operations (id),
    original_operation_id UUID NOT NULL REFERENCES financial_operations (id),
    account_id UUID NOT NULL REFERENCES accounts (id),
    amount NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    reason VARCHAR(255) NOT NULL,
    note VARCHAR(255),
    CHECK (operation_id <> original_operation_id)
);

-- Down Migration

DROP TABLE refunds;
