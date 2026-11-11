-- Return user portfolio
-- (plain GROUP BY variant in aggregations.sql)
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
