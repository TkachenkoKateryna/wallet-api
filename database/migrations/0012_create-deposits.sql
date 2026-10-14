-- Up Migration

-- Allow the new operation type
ALTER TABLE financial_operations
    DROP CONSTRAINT financial_operations_type_check;

ALTER TABLE financial_operations
    ADD CONSTRAINT chk_financial_operations_type
    CHECK (type IN (
        'transfer',
        'withdrawal',
        'refund',
        'deposit'
    ));

-- Subtype of financial_operations, like transfers and withdrawals.
-- Must credit a customer wallet; the posting service enforces that
CREATE TABLE deposits (
    operation_id UUID PRIMARY KEY REFERENCES financial_operations (id),
    account_id UUID NOT NULL REFERENCES accounts (id),
    amount NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    provider_reference VARCHAR(255),
    note VARCHAR(255)
);


-- Down Migration

-- Deposit operations would violate the old type restriction
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM financial_operations
        WHERE type = 'deposit'
    ) THEN
        RAISE EXCEPTION
            'Cannot rollback: deposit operations exist';
    END IF;
END
$$;

DROP TABLE deposits;

ALTER TABLE financial_operations
    DROP CONSTRAINT chk_financial_operations_type;

ALTER TABLE financial_operations
    ADD CONSTRAINT financial_operations_type_check
    CHECK (type IN (
        'transfer',
        'withdrawal',
        'refund'
    ));
