-- For each user, show name, wallet balance per currency (from ledger entries) and number of linked bank accounts, including users with none (show 0).
-- Remember fan-out problem. Balances are never summed across currencies, so a user
-- with several wallets gets one row per currency (bank_accounts repeats on each row).

WITH balances AS (
  SELECT a.user_id, a.currency, COALESCE(SUM(le.amount), 0) AS balance
  FROM accounts a
  LEFT JOIN ledger_entries le ON le.account_id = a.id
  WHERE a.account_type = 'wallet'
  GROUP BY a.user_id, a.currency
),
banks AS (
  SELECT user_id, COUNT(*) AS bank_accounts
  FROM bank_accounts
  GROUP BY user_id
)
SELECT u.name,
       b.currency,
       COALESCE(b.balance, 0)       AS balance,
       COALESCE(k.bank_accounts, 0) AS bank_accounts
FROM users u
LEFT JOIN balances b ON b.user_id = u.id
LEFT JOIN banks    k ON k.user_id = u.id
ORDER BY u.name, b.currency;

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
-- (CTE variant in ctes.sql)
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
