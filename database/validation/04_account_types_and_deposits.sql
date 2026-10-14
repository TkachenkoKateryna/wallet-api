-- Checks the account type and deposit rules added by migrations 0011-0012.
-- Run on a seeded development database. Everything runs in one transaction that is
-- rolled back, so no test data is left behind.
-- Each passing check prints "ok: ..."; the first failing one raises "FAIL: ..." and stops.

BEGIN;

-- Runs a statement that must be rejected by the named constraint
CREATE FUNCTION pg_temp.expect_violation(label TEXT, statement TEXT, expected_constraint TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    violated TEXT;
BEGIN
    EXECUTE statement;
    RAISE EXCEPTION 'FAIL: % (statement was accepted)', label;
EXCEPTION
    WHEN integrity_constraint_violation THEN
        GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
        IF violated IS DISTINCT FROM expected_constraint THEN
            RAISE EXCEPTION 'FAIL: % (violated % instead of %)', label, violated, expected_constraint;
        END IF;
        RAISE NOTICE 'ok: %', label;
END
$$;

-- Test fixtures. IDs: e0000000-0000-0000-0000-0000000000NN
INSERT INTO users (id, email, name) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'schema-check@example.com', 'Schema Check');

INSERT INTO accounts (id, user_id, account_type, currency) VALUES
    ('e0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'wallet', 'USD');

INSERT INTO financial_operations (id, type, idempotency_key) VALUES
    ('e0000000-0000-0000-0000-000000000003', 'deposit',  'schema-check-deposit'),
    ('e0000000-0000-0000-0000-000000000004', 'transfer', 'schema-check-transfer');


-- =========================================
-- 1. EXISTING DATA
-- =========================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'public'
          AND NOT c.convalidated
    ) THEN
        RAISE EXCEPTION 'FAIL: some constraints were added without validating existing rows';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM accounts a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE a.account_type = 'wallet'
          AND u.id IS NULL
    ) THEN
        RAISE EXCEPTION 'FAIL: a wallet account has no existing owner';
    END IF;

    RAISE NOTICE 'ok: existing users and accounts satisfy all constraints';
END
$$;


-- =========================================
-- 2. ACCOUNT TYPES
-- =========================================

DO $$
BEGIN
    PERFORM pg_temp.expect_violation(
        'wallet account requires user_id',
        $sql$INSERT INTO accounts (account_type, user_id, currency) VALUES ('wallet', NULL, 'EUR')$sql$,
        'chk_accounts_ownership');

    PERFORM pg_temp.expect_violation(
        'system account requires user_id = NULL',
        $sql$INSERT INTO accounts (account_type, user_id, system_code, currency)
             VALUES ('system', 'e0000000-0000-0000-0000-000000000001', 'settlement', 'EUR')$sql$,
        'chk_accounts_ownership');

    PERFORM pg_temp.expect_violation(
        'unsupported account type is rejected',
        $sql$INSERT INTO accounts (account_type, user_id, currency)
             VALUES ('savings', 'e0000000-0000-0000-0000-000000000001', 'EUR')$sql$,
        'chk_accounts_account_type');

    PERFORM pg_temp.expect_violation(
        'system account requires a system_code',
        $sql$INSERT INTO accounts (account_type, user_id, system_code, currency) VALUES ('system', NULL, NULL, 'EUR')$sql$,
        'chk_accounts_system_code');

    PERFORM pg_temp.expect_violation(
        'wallet account cannot have a system_code',
        $sql$INSERT INTO accounts (account_type, user_id, system_code, currency)
             VALUES ('wallet', 'e0000000-0000-0000-0000-000000000001', 'settlement', 'EUR')$sql$,
        'chk_accounts_system_code');

    PERFORM pg_temp.expect_violation(
        'only one settlement account per currency',
        $sql$INSERT INTO accounts (account_type, user_id, system_code, currency) VALUES ('system', NULL, 'settlement', 'USD')$sql$,
        'uq_accounts_system_code_currency');
END
$$;


-- =========================================
-- 3. SETTLEMENT ACCOUNT SEEDS
-- =========================================

DO $$
DECLARE
    inserted INTEGER;
BEGIN
    IF (
        SELECT COUNT(*) FROM accounts
        WHERE account_type = 'system'
          AND system_code = 'settlement'
          AND currency IN ('USD', 'EUR', 'UAH')
    ) <> 3 THEN
        RAISE EXCEPTION 'FAIL: expected one settlement account for each of USD, EUR, UAH';
    END IF;

    -- Same statement as database/seeds/development/02_accounts.sql
    INSERT INTO accounts (id, user_id, account_type, system_code, currency, status) VALUES
        ('b0000000-0000-0000-0000-000000000001', NULL, 'system', 'settlement', 'USD', 'active'),
        ('b0000000-0000-0000-0000-000000000002', NULL, 'system', 'settlement', 'EUR', 'active'),
        ('b0000000-0000-0000-0000-000000000003', NULL, 'system', 'settlement', 'UAH', 'active')
    ON CONFLICT (system_code, currency) DO NOTHING;

    GET DIAGNOSTICS inserted = ROW_COUNT;
    IF inserted <> 0 THEN
        RAISE EXCEPTION 'FAIL: re-running the settlement seed inserted % rows', inserted;
    END IF;

    RAISE NOTICE 'ok: settlement accounts exist and their seed is idempotent';
END
$$;


-- =========================================
-- 4. OPERATIONS AND DEPOSITS
-- =========================================

DO $$
BEGIN
    PERFORM pg_temp.expect_violation(
        'unsupported operation type is rejected',
        $sql$INSERT INTO financial_operations (type, idempotency_key) VALUES ('chargeback', 'schema-check-chargeback')$sql$,
        'chk_financial_operations_type');

    PERFORM pg_temp.expect_violation(
        'deposit requires an existing operation',
        $sql$INSERT INTO deposits (operation_id, account_id, amount)
             VALUES (gen_random_uuid(), 'e0000000-0000-0000-0000-000000000002', 10)$sql$,
        'deposits_operation_id_fkey');

    PERFORM pg_temp.expect_violation(
        'deposit requires an existing account',
        $sql$INSERT INTO deposits (operation_id, account_id, amount)
             VALUES ('e0000000-0000-0000-0000-000000000003', gen_random_uuid(), 10)$sql$,
        'deposits_account_id_fkey');

    PERFORM pg_temp.expect_violation(
        'deposit amount must be positive',
        $sql$INSERT INTO deposits (operation_id, account_id, amount)
             VALUES ('e0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 0)$sql$,
        'deposits_amount_check');

    INSERT INTO deposits (operation_id, account_id, amount, provider_reference)
    VALUES ('e0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', 10, 'SCHEMA-CHECK');

    RAISE NOTICE 'ok: valid deposit is accepted';
END
$$;


-- =========================================
-- 5. EXISTING FOREIGN KEYS
-- =========================================

DO $$
BEGIN
    PERFORM pg_temp.expect_violation(
        'transfer requires an existing source account',
        $sql$INSERT INTO transfers (operation_id, source_account_id, destination_account_id, amount)
             VALUES ('e0000000-0000-0000-0000-000000000004', gen_random_uuid(), 'e0000000-0000-0000-0000-000000000002', 10)$sql$,
        'transfers_source_account_id_fkey');

    PERFORM pg_temp.expect_violation(
        'ledger entry requires an existing account',
        $sql$INSERT INTO ledger_entries (ledger_transaction_id, account_id, amount)
             VALUES ((SELECT id FROM ledger_transactions LIMIT 1), gen_random_uuid(), 10)$sql$,
        'ledger_entries_account_id_fkey');

    PERFORM pg_temp.expect_violation(
        'user with accounts cannot be deleted',
        $sql$DELETE FROM users WHERE id = 'e0000000-0000-0000-0000-000000000001'$sql$,
        'accounts_user_id_fkey');
END
$$;


-- =========================================
-- 6. SEEDED DEPOSIT POSTINGS
-- =========================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM financial_operations
        WHERE type = 'deposit'
          AND status = 'posted'
    ) THEN
        RAISE EXCEPTION 'FAIL: no posted deposit fixtures found. Run npm run seed:dev first';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM deposits d
        JOIN accounts a ON a.id = d.account_id
        WHERE a.account_type <> 'wallet'
    ) THEN
        RAISE EXCEPTION 'FAIL: a deposit targets a system account';
    END IF;

    -- Each posted deposit: exactly two entries, +amount on the wallet,
    -- -amount on the settlement account of the same currency
    IF EXISTS (
        SELECT 1
        FROM financial_operations fo
        JOIN deposits d ON d.operation_id = fo.id
        JOIN accounts wallet ON wallet.id = d.account_id
        LEFT JOIN ledger_transactions lt ON lt.operation_id = fo.id
        WHERE fo.status = 'posted'
          AND (
              lt.id IS NULL
              OR (
                  SELECT COUNT(*) FROM ledger_entries le
                  WHERE le.ledger_transaction_id = lt.id
              ) <> 2
              OR NOT EXISTS (
                  SELECT 1 FROM ledger_entries le
                  WHERE le.ledger_transaction_id = lt.id
                    AND le.account_id = d.account_id
                    AND le.amount = d.amount
              )
              OR NOT EXISTS (
                  SELECT 1 FROM ledger_entries le
                  JOIN accounts s ON s.id = le.account_id
                  WHERE le.ledger_transaction_id = lt.id
                    AND s.system_code = 'settlement'
                    AND s.currency = wallet.currency
                    AND le.amount = -d.amount
              )
          )
    ) THEN
        RAISE EXCEPTION 'FAIL: a posted deposit is missing its balanced settlement/wallet entries';
    END IF;

    RAISE NOTICE 'ok: seeded deposits post balanced entries against the settlement account';
END
$$;


-- =========================================
-- 7. OPERATION SUBTYPES
-- =========================================

-- Each operation has exactly one subtype row, in the table matching its type
DO $$
DECLARE
    bad_operation UUID;
BEGIN
    SELECT fo.id INTO bad_operation
    FROM financial_operations fo
    LEFT JOIN transfers t ON t.operation_id = fo.id
    LEFT JOIN withdrawals w ON w.operation_id = fo.id
    LEFT JOIN refunds r ON r.operation_id = fo.id
    LEFT JOIN deposits d ON d.operation_id = fo.id
    WHERE fo.id NOT IN ('e0000000-0000-0000-0000-000000000004')  -- fixture without a subtype
      AND (
          (t.operation_id IS NOT NULL)::INT + (w.operation_id IS NOT NULL)::INT
          + (r.operation_id IS NOT NULL)::INT + (d.operation_id IS NOT NULL)::INT <> 1
          OR CASE fo.type
              WHEN 'transfer'   THEN t.operation_id
              WHEN 'withdrawal' THEN w.operation_id
              WHEN 'refund'     THEN r.operation_id
              WHEN 'deposit'    THEN d.operation_id
          END IS NULL
      )
    LIMIT 1;

    IF bad_operation IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: operation % does not have exactly one matching subtype row', bad_operation;
    END IF;

    RAISE NOTICE 'ok: every operation has exactly one subtype matching its type';
END
$$;

ROLLBACK;
