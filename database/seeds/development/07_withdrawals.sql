-- 5 withdrawals. Posted ones pay into the settlement account of the same currency (see ledger entries)

INSERT INTO withdrawals (operation_id, account_id, bank_account_id, amount, provider_reference, note) VALUES
    ('d0000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001',  400.00, 'PAYOUT-0001', NULL),                -- Olena USD -> PrivatBank
    ('d0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000003',  150.00, 'PAYOUT-0002', NULL),                -- Mark USD -> Chase
    ('d0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000004', 5000.00, 'PAYOUT-0003', 'Monthly savings'),   -- Sofia UAH -> Oschadbank
    ('d0000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000002',  300.00, NULL,          NULL),                -- Olena EUR -> Monobank (pending: bank account unverified)
    ('d0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000005', 1000.00, NULL,          NULL);                -- Taras UAH -> PrivatBank (failed)
