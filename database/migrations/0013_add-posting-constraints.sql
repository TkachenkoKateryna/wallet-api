-- Up Migration

-- =========================================
-- 1. FINANCIAL OPERATIONS
-- =========================================

-- Why an operation failed. NULL unless status = 'failed'
ALTER TABLE financial_operations
    ADD COLUMN failure_code VARCHAR(50);

-- Hash of the request payload. NULL for seed rows, which have no hash
ALTER TABLE financial_operations
    ADD COLUMN request_hash CHAR(64);

-- Backfill before the check, or existing failed rows would violate it
UPDATE financial_operations
SET failure_code = 'INSUFFICIENT_FUNDS'
WHERE status = 'failed';

-- A failure code exists exactly when the operation failed
ALTER TABLE financial_operations
    ADD CONSTRAINT chk_financial_operations_failure_code
    CHECK ((status = 'failed') = (failure_code IS NOT NULL));

-- Only known failure codes. NULL passes, which the check above already ties to status
ALTER TABLE financial_operations
    ADD CONSTRAINT chk_financial_operations_failure_code_values
    CHECK (failure_code IN ('INSUFFICIENT_FUNDS'));

-- SHA-256 as 64 lowercase hex characters. NULL passes (seed rows have no hash)
ALTER TABLE financial_operations
    ADD CONSTRAINT chk_financial_operations_request_hash
    CHECK (request_hash ~ '^[0-9a-f]{64}$');


-- =========================================
-- 2. ACCOUNTS
-- =========================================

-- One settlement account per supported currency
INSERT INTO accounts (user_id, currency, status, account_type, system_code)
VALUES
    (NULL, 'USD', 'active', 'system', 'settlement'),
    (NULL, 'EUR', 'active', 'system', 'settlement'),
    (NULL, 'UAH', 'active', 'system', 'settlement')
ON CONFLICT (system_code, currency) DO NOTHING;


-- =========================================
-- 3. DEPOSITS
-- =========================================

-- One deposit per non-NULL provider reference
ALTER TABLE deposits
    ADD CONSTRAINT uq_deposits_provider_reference
    UNIQUE (provider_reference);


-- Down Migration

-- =========================================
-- 1. DEPOSITS
-- =========================================

ALTER TABLE deposits
    DROP CONSTRAINT uq_deposits_provider_reference;


-- =========================================
-- 2. ACCOUNTS
-- =========================================

-- The settlement accounts are intentionally NOT deleted.
-- Ledger entries may reference them, and removing them would
-- either fail on the foreign key or orphan the ledger history


-- =========================================
-- 3. FINANCIAL OPERATIONS
-- =========================================

ALTER TABLE financial_operations
    DROP CONSTRAINT chk_financial_operations_request_hash;

ALTER TABLE financial_operations
    DROP CONSTRAINT chk_financial_operations_failure_code_values;

ALTER TABLE financial_operations
    DROP CONSTRAINT chk_financial_operations_failure_code;

ALTER TABLE financial_operations
    DROP COLUMN request_hash;

ALTER TABLE financial_operations
    DROP COLUMN failure_code;
