-- 28 operations covering every status. IDs: d0000000-0000-0000-0000-0000000000NN

INSERT INTO financial_operations (id, type, status, idempotency_key, created_at, updated_at)
SELECT id::UUID, type, status, idempotency_key, NOW() - make_interval(days => days_ago), NOW() - make_interval(days => days_ago)
FROM (VALUES
    -- Initial funding: deposits from the settlement accounts
    ('d0000000-0000-0000-0000-000000000001', 'deposit',    'posted',   'seed-op-01', 60),
    ('d0000000-0000-0000-0000-000000000002', 'deposit',    'posted',   'seed-op-02', 60),
    ('d0000000-0000-0000-0000-000000000003', 'deposit',    'posted',   'seed-op-03', 60),
    ('d0000000-0000-0000-0000-000000000004', 'deposit',    'posted',   'seed-op-04', 59),
    ('d0000000-0000-0000-0000-000000000005', 'deposit',    'posted',   'seed-op-05', 59),
    ('d0000000-0000-0000-0000-000000000006', 'deposit',    'posted',   'seed-op-06', 58),
    ('d0000000-0000-0000-0000-000000000007', 'deposit',    'posted',   'seed-op-07', 58),
    ('d0000000-0000-0000-0000-000000000008', 'deposit',    'posted',   'seed-op-08', 57),
    ('d0000000-0000-0000-0000-000000000009', 'deposit',    'posted',   'seed-op-09', 57),
    -- Transfers between users
    ('d0000000-0000-0000-0000-000000000010', 'transfer',   'posted',   'seed-op-10', 45),
    ('d0000000-0000-0000-0000-000000000011', 'transfer',   'posted',   'seed-op-11', 40),
    ('d0000000-0000-0000-0000-000000000012', 'transfer',   'posted',   'seed-op-12', 38),
    ('d0000000-0000-0000-0000-000000000013', 'transfer',   'posted',   'seed-op-13', 35),
    ('d0000000-0000-0000-0000-000000000014', 'transfer',   'posted',   'seed-op-14', 30),
    ('d0000000-0000-0000-0000-000000000015', 'transfer',   'posted',   'seed-op-15', 28),
    ('d0000000-0000-0000-0000-000000000016', 'transfer',   'posted',   'seed-op-16', 25),
    ('d0000000-0000-0000-0000-000000000017', 'transfer',   'pending',  'seed-op-17', 1),
    ('d0000000-0000-0000-0000-000000000018', 'transfer',   'failed',   'seed-op-18', 5),
    ('d0000000-0000-0000-0000-000000000019', 'transfer',   'canceled', 'seed-op-19', 3),
    -- Withdrawals
    ('d0000000-0000-0000-0000-000000000020', 'withdrawal', 'posted',   'seed-op-20', 20),
    ('d0000000-0000-0000-0000-000000000021', 'withdrawal', 'posted',   'seed-op-21', 18),
    ('d0000000-0000-0000-0000-000000000022', 'withdrawal', 'posted',   'seed-op-22', 15),
    ('d0000000-0000-0000-0000-000000000023', 'withdrawal', 'pending',  'seed-op-23', 2),
    ('d0000000-0000-0000-0000-000000000024', 'withdrawal', 'failed',   'seed-op-24', 4),
    -- Refunds
    ('d0000000-0000-0000-0000-000000000025', 'refund',     'posted',   'seed-op-25', 12),
    ('d0000000-0000-0000-0000-000000000026', 'refund',     'posted',   'seed-op-26', 10),
    ('d0000000-0000-0000-0000-000000000027', 'refund',     'posted',   'seed-op-27', 8),
    ('d0000000-0000-0000-0000-000000000028', 'refund',     'pending',  'seed-op-28', 1)
) AS o (id, type, status, idempotency_key, days_ago);
