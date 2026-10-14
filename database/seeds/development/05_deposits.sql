-- 9 deposits: initial funding of customer wallets. Each posting moves money from the
-- settlement account of the same currency to the wallet (see ledger entries)

INSERT INTO deposits (operation_id, account_id, amount, provider_reference, note) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004',  5000.00, 'TOPUP-0001', 'Initial funding'),   -- Olena USD
    ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000005',  2000.00, 'TOPUP-0002', 'Initial funding'),   -- Olena EUR
    ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000006', 50000.00, 'TOPUP-0003', 'Initial funding'),   -- Olena UAH
    ('d0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000007',  3000.00, 'TOPUP-0004', 'Initial funding'),   -- Mark USD
    ('d0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000008',  1500.00, 'TOPUP-0005', 'Initial funding'),   -- Mark EUR
    ('d0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000010', 40000.00, 'TOPUP-0006', 'Initial funding'),   -- Sofia UAH
    ('d0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000009',  1000.00, 'TOPUP-0007', 'Initial funding'),   -- Sofia USD
    ('d0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000012', 20000.00, 'TOPUP-0008', 'Initial funding'),   -- Taras UAH
    ('d0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000013',   500.00, 'TOPUP-0009', 'Initial funding');   -- Taras EUR
