-- Return every user together with all their present accounts.
SELECT
    u.id AS user_id,
    u.email,
    a.id AS account_id,
    a.currency,
    a.created_at AS account_creation_date
FROM users u
INNER JOIN accounts a
ON a.user_id = u.id
ORDER BY u.email ASC, a.created_at ASC;

-- Return users including those without accounts
SELECT
    u.id AS user_id,
    u.email,
    a.id AS account_id,
    a.currency
FROM users u
LEFT JOIN accounts a
ON a.user_id = u.id
ORDER BY u.id ASC, a.id ASC;

-- Return only users who have USD wallet
SELECT u.name, a.id
FROM users u
LEFT JOIN accounts a ON a.user_id = u.id
WHERE a.currency = 'USD'; 

--- Return all users and show which has USD accounts 
SELECT u.name, a.id
FROM users u
LEFT JOIN accounts a ON a.user_id = u.id AND a.currency = 'USD'

-- Return users without accounts
-- (anti-join via LEFT JOIN; NOT EXISTS variant in subqueries.sql)
SELECT
    u.id AS user_id,
    u.email
FROM users u
LEFT JOIN accounts a
ON a.user_id = u.id
WHERE a.id IS NULL
ORDER BY u.id ASC;

-- List all posted transfers with their amount, source wallet and destination wallet.
SELECT fo.id, t.amount, t.source_account_id, t.destination_account_id
FROM financial_operations fo
JOIN transfers t ON t.operation_id = fo.id
WHERE fo.status = 'posted';

-- Return posted transfers with human-readable account information
-- (correlated-subquery variant in subqueries.sql)
SELECT
    t.operation_id AS transfer_id,
    t.source_account_id,
    src.currency AS source_currency,
    t.destination_account_id,
    dest.currency AS destination_currency,
    t.amount,
    fo.created_at,
	fo.status
FROM transfers t
INNER JOIN financial_operations fo
    ON fo.id = t.operation_id
INNER JOIN accounts src
    ON src.id = t.source_account_id
INNER JOIN accounts dest
    ON dest.id = t.destination_account_id
WHERE fo.status = 'posted'
ORDER BY fo.created_at DESC;

-- Find accounts that have never had a ledger entry.
-- (anti-join via LEFT JOIN; NOT EXISTS variant in subqueries.sql)
SELECT
    a.id AS account_id,
    a.user_id,
    a.currency,
    a.created_at
FROM accounts a
LEFT JOIN ledger_entries le
    ON le.account_id = a.id
WHERE le.account_id IS NULL
ORDER BY a.created_at DESC;

-- List all operations of every type and status with their amount taken from the matching subtype table.
SELECT fo.id, fo.type, fo.status,
       COALESCE(t.amount, d.amount, w.amount, r.amount) AS amount
FROM financial_operations fo
LEFT JOIN transfers   t ON t.operation_id = fo.id
LEFT JOIN deposits    d ON d.operation_id = fo.id
LEFT JOIN withdrawals w ON w.operation_id = fo.id
LEFT JOIN refunds     r ON r.operation_id = fo.id;

-- List all transfers with their amount, sender name and receiver name.
SELECT t.operation_id, t.amount,
       su.name AS sender, du.name AS receiver
FROM transfers t
JOIN accounts src ON src.id = t.source_account_id
JOIN users    su  ON su.id  = src.user_id
JOIN accounts dst ON dst.id = t.destination_account_id
JOIN users    du  ON du.id  = dst.user_id;

-- Show each settlement account with its balance (always ≤ 0: minus the money customers hold in that currency).
SELECT a.currency,
       a.system_code,
       COALESCE(SUM(le.amount), 0) AS balance
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.id
WHERE a.account_type = 'system'
  AND a.system_code  = 'settlement'
GROUP BY a.id, a.currency, a.system_code
ORDER BY a.currency;


-- For one wallet, list each ledger entry with its operation type and status, newest first.
SELECT le.id          AS entry_id,
       le.created_at,
       le.amount,
       fo.id          AS operation_id,
       fo.type        AS operation_type,
       fo.status      AS operation_status
FROM ledger_entries le
JOIN ledger_transactions lt  ON lt.id = le.ledger_transaction_id
JOIN financial_operations fo ON fo.id = lt.operation_id
WHERE le.account_id = (
        SELECT a.id
        FROM accounts a
        JOIN users u ON u.id = a.user_id
        WHERE u.name = 'Olena Kovalenko'
          AND a.currency = 'USD'
          AND a.account_type = 'wallet'
      )
ORDER BY le.created_at DESC, le.id DESC;