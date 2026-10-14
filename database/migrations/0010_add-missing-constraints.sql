
-- Up Migration

-- =========================================
-- 1. ACCOUNTS
-- =========================================

-- Restrict currencies to supported values
ALTER TABLE accounts
    DROP CONSTRAINT accounts_currency_check;

ALTER TABLE accounts
    ADD CONSTRAINT chk_accounts_currency
    CHECK (currency IN ('USD', 'EUR', 'UAH'));

-- One account per currency per user
ALTER TABLE accounts
    ADD CONSTRAINT uq_accounts_user_currency
    UNIQUE (user_id, currency);

-- Prevent deleting users with accounts
ALTER TABLE accounts
    DROP CONSTRAINT accounts_user_id_fkey;

ALTER TABLE accounts
    ADD CONSTRAINT accounts_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT;


-- =========================================
-- 2. FINANCIAL OPERATIONS
-- =========================================

-- Remove old status restriction
ALTER TABLE financial_operations
    DROP CONSTRAINT financial_operations_status_check;

-- Convert existing statuses
UPDATE financial_operations
SET status = 'posted'
WHERE status = 'completed';

-- Apply new status restriction
ALTER TABLE financial_operations
    ADD CONSTRAINT chk_financial_operations_status
    CHECK (status IN (
        'pending',
        'posted',
        'failed',
        'canceled'
    ));


-- =========================================
-- 3. WITHDRAWALS
-- =========================================

-- One withdrawal per non-NULL provider reference
ALTER TABLE withdrawals
    ADD CONSTRAINT uq_withdrawals_provider_reference
    UNIQUE (provider_reference);


-- =========================================
-- 4. REFUNDS
-- =========================================

-- Refund reason is optional
ALTER TABLE refunds
    ALTER COLUMN reason DROP NOT NULL;


-- Down Migration

-- =========================================
-- 1. REFUNDS
-- =========================================

-- Prevent rollback if NULL reasons exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM refunds
        WHERE reason IS NULL
    ) THEN
        RAISE EXCEPTION
            'Cannot rollback: refunds contain NULL reasons';
    END IF;
END
$$;

ALTER TABLE refunds
    ALTER COLUMN reason SET NOT NULL;


-- =========================================
-- 2. WITHDRAWALS
-- =========================================

ALTER TABLE withdrawals
    DROP CONSTRAINT uq_withdrawals_provider_reference;


-- =========================================
-- 3. FINANCIAL OPERATIONS
-- =========================================

-- Old schema does not allow canceled status
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM financial_operations
        WHERE status = 'canceled'
    ) THEN
        RAISE EXCEPTION
            'Cannot rollback: canceled operations exist';
    END IF;
END
$$;

ALTER TABLE financial_operations
    DROP CONSTRAINT chk_financial_operations_status;

UPDATE financial_operations
SET status = 'completed'
WHERE status = 'posted';

ALTER TABLE financial_operations
    ADD CONSTRAINT financial_operations_status_check
    CHECK (status IN (
        'pending',
        'completed',
        'failed'
    ));


-- =========================================
-- 4. ACCOUNTS
-- =========================================

ALTER TABLE accounts
    DROP CONSTRAINT accounts_user_id_fkey;

ALTER TABLE accounts
    ADD CONSTRAINT accounts_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES users(id);

ALTER TABLE accounts
    DROP CONSTRAINT uq_accounts_user_currency;

ALTER TABLE accounts
    DROP CONSTRAINT chk_accounts_currency;

ALTER TABLE accounts
    ADD CONSTRAINT accounts_currency_check
    CHECK (currency ~ '^[A-Z]{3}$');