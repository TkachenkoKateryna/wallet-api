-- 13 accounts: 3 system settlement accounts, 10 customer wallets (one closed, one frozen).
-- IDs: b0000000-0000-4000-8000-0000000000NN

-- Settlement accounts: the counterparty for deposits and withdrawals in each currency.
-- Safe to re-run: an existing settlement account for the currency is kept.
INSERT INTO accounts (id, user_id, account_type, system_code, currency, status) VALUES
    ('b0000000-0000-4000-8000-000000000001', NULL, 'system', 'settlement', 'USD', 'active'),
    ('b0000000-0000-4000-8000-000000000002', NULL, 'system', 'settlement', 'EUR', 'active'),
    ('b0000000-0000-4000-8000-000000000003', NULL, 'system', 'settlement', 'UAH', 'active')
ON CONFLICT (system_code, currency) DO NOTHING;

INSERT INTO accounts (id, user_id, account_type, currency, status) VALUES
    -- Olena
    ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002', 'wallet', 'USD', 'active'),
    ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002', 'wallet', 'EUR', 'active'),
    ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000002', 'wallet', 'UAH', 'active'),
    -- Mark
    ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000003', 'wallet', 'USD', 'active'),
    ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000003', 'wallet', 'EUR', 'active'),
    -- Sofia
    ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000004', 'wallet', 'USD', 'active'),
    ('b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000004', 'wallet', 'UAH', 'active'),
    ('b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000004', 'wallet', 'EUR', 'closed'),
    -- Taras
    ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000005', 'wallet', 'UAH', 'active'),
    ('b0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000005', 'wallet', 'EUR', 'frozen');
