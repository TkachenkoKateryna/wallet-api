-- Return users without accounts
-- (NOT EXISTS anti-join; LEFT JOIN variant in joins.sql)
SELECT u.id, u.email
FROM users u
WHERE NOT EXISTS (
    SELECT 1
    FROM accounts a
    WHERE a.user_id = u.id
);

-- Return posted transfers with human-readable account information
-- (correlated scalar subqueries; JOIN variant in joins.sql)
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
-- (NOT EXISTS anti-join; LEFT JOIN variant in joins.sql)
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
