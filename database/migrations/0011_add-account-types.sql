-- Up Migration

-- Every existing account has an owner, so the default keeps them all valid wallets
ALTER TABLE accounts
    ADD COLUMN account_type VARCHAR(20) NOT NULL DEFAULT 'wallet';

ALTER TABLE accounts
    ADD CONSTRAINT chk_accounts_account_type
    CHECK (account_type IN ('wallet', 'system'));

-- Role of a system account, e.g. 'settlement'. NULL for wallets
ALTER TABLE accounts
    ADD COLUMN system_code VARCHAR(50);

-- System accounts have no owner
ALTER TABLE accounts
    ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE accounts
    ADD CONSTRAINT chk_accounts_ownership
    CHECK (
        (account_type = 'wallet' AND user_id IS NOT NULL)
        OR
        (account_type = 'system' AND user_id IS NULL)
    );

ALTER TABLE accounts
    ADD CONSTRAINT chk_accounts_system_code
    CHECK (
        (account_type = 'wallet' AND system_code IS NULL)
        OR
        -- IN alone would let NULL through: a CHECK passes when it evaluates to NULL
        (account_type = 'system' AND system_code IS NOT NULL AND system_code IN ('settlement'))
    );

-- One system account per role and currency, e.g. a single USD settlement account.
-- uq_accounts_user_currency doesn't cover system accounts: their user_id is NULL
ALTER TABLE accounts
    ADD CONSTRAINT uq_accounts_system_code_currency
    UNIQUE (system_code, currency);


-- Down Migration

-- The old schema requires an owner for every account
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM accounts
        WHERE account_type = 'system'
    ) THEN
        RAISE EXCEPTION
            'Cannot rollback: system accounts exist';
    END IF;
END
$$;

ALTER TABLE accounts
    DROP CONSTRAINT uq_accounts_system_code_currency;

ALTER TABLE accounts
    DROP CONSTRAINT chk_accounts_system_code;

ALTER TABLE accounts
    DROP CONSTRAINT chk_accounts_ownership;

ALTER TABLE accounts
    ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE accounts
    DROP COLUMN system_code;

ALTER TABLE accounts
    DROP CONSTRAINT chk_accounts_account_type;

ALTER TABLE accounts
    DROP COLUMN account_type;
