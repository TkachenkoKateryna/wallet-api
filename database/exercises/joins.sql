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

-- Return users without accounts 
SELECT 
    u.id AS user_id, 
    u.email, 
    a.id AS account_id, 
FROM users u
LEFT JOIN accounts a 
ON a.user_id = u.id 
WHERE a.id = NULL
ORDER BY u.id ASC;

SELECT u.id, u.email
FROM users u
WHERE NOT EXISTS (
    SELECT 1
    FROM accounts a
    WHERE a.user_id = u.id
);

-- Calculate the current balance of every account.

/*
 * TODO: Optimize balance calculation for large datasets.
 * - Store current balances in a separate account_balances table.
 * - Update balances and ledger entries atomically in one transaction.
 * - Keep immutable ledger entries as the source of truth.
 * - Use stored balances for fast lookups instead of SUM().
 */
SELECT
    a.id AS account_id,
    a.currency,
    COALESCE(SUM(le.amount), 0) AS balance
FROM accounts a
LEFT JOIN ledger_entries le
    ON a.id = le.account_id
GROUP BY a.id
ORDER BY a.id;
 

-- Return user portfolio
SELECT
    u.id AS user_id,
    u.email,
    COUNT(a.id) AS account_count,
    COUNT(DISTINCT a.currency) AS currency_count
FROM users u
LEFT JOIN accounts a
    ON a.user_id = u.id
GROUP BY u.id
ORDER BY u.id;

WITH account_stats AS (
    SELECT
        user_id,
        COUNT(*) AS account_count,
        COUNT(DISTINCT currency) AS currency_count
    FROM accounts
    GROUP BY user_id
)
SELECT
    u.id AS user_id,
    u.email,
    COALESCE(s.account_count, 0) AS account_count,
    COALESCE(s.currency_count, 0) AS currency_count
FROM users u
LEFT JOIN account_stats s
    ON s.user_id = u.id;

-- Return posted transfers with human-readable account information
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

SELECT
    t.operation_id AS transfer_id,
    t.source_account_id,
    (
        SELECT a.currency
        FROM accounts a
        WHERE a.id = t.source_account_id
    ) AS source_currency,
    t.destination_account_id,
    (
        SELECT a.currency
        FROM accounts a
        WHERE a.id = t.destination_account_id
    ) AS destination_currency,
    t.amount,
    fo.created_at,
	fo.status
FROM transfers t
JOIN financial_operations fo
    ON t.operation_id = fo.id
WHERE fo.status = 'posted'
ORDER BY fo.created_at DESC;

/*
 * Correlated Subqueries vs JOINs
 *
 * - Correlated subqueries may execute once per outer row.
 * - JOINs give PostgreSQL more flexibility in choosing execution strategies.
 * - Neither approach is inherently faster.
 *
 * EXPLAIN ANALYZE results:
 * - Subqueries: 2 × 16 indexed account lookups.
 * - JOINs: Same 32 lookups using nested-loop joins.
 * - Nearly identical execution time and buffer usage.
 *
 * Best practice:
 * Prefer JOINs for related entity retrieval: clearer relationships,
 * easier extensibility, and greater optimization flexibility.
 * Always verify performance with EXPLAIN ANALYZE.
 */

-- Find accounts that have never had a ledger entry.
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

SELECT
    a.id AS account_id,
    a.user_id,
    a.currency,
    a.created_at
FROM accounts a
WHERE NOT EXISTS (
    SELECT 1
    FROM ledger_entries le
    WHERE le.account_id = a.id
)
ORDER BY a.created_at DESC;