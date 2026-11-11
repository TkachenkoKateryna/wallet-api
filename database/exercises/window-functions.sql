-- Reconciliation per currency
SELECT a.currency,
       COALESCE(SUM(le.amount) FILTER (WHERE a.account_type = 'wallet'), 0) AS wallets,
       COALESCE(SUM(le.amount) FILTER (WHERE a.account_type = 'system'), 0) AS settlement,
       SUM(le.amount)                                                       AS total -- must be 0
FROM ledger_entries le
JOIN accounts a ON a.id = le.account_id
GROUP BY a.currency;

-- List every ledger entry with its wallet's total balance shown on each row.
SELECT account_id, created_at, amount,
       SUM(amount) OVER (PARTITION BY account_id) AS wallet_total
FROM ledger_entries;

-- List every ledger entry with the wallet's running balance after that entry.
SELECT account_id, created_at, amount,
       SUM(amount) OVER (PARTITION BY account_id ORDER BY created_at, id) AS balance_after
FROM ledger_entries
ORDER BY account_id, created_at, id;