-- 4 refunds, including two partial refunds of transfer 10

INSERT INTO refunds (operation_id, original_operation_id, account_id, amount, reason, note) VALUES
    ('d0000000-0000-4000-8000-000000000025', 'd0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000004',  50.00, 'Partial refund: one ticket returned', NULL),  -- Mark -> Olena USD
    ('d0000000-0000-4000-8000-000000000026', 'd0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000007', 150.00, 'Payout returned by bank',             NULL),  -- bounced withdrawal -> Mark USD
    ('d0000000-0000-4000-8000-000000000027', 'd0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000004',  25.00, NULL,                                  NULL),  -- second partial refund of op 10
    ('d0000000-0000-4000-8000-000000000028', 'd0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000006', 200.00, 'Duplicate payment',                   NULL);  -- Sofia -> Olena UAH (pending)
