-- System accounts have no owner, so users is LEFT JOINed and they show their system_code instead.
-- Settlement balances are negative by the amount customers hold in that currency.

SELECT
    a.id AS account_id,
    a.account_type,
    COALESCE(u.name, a.system_code) AS owner,
    a.currency,
    COALESCE(SUM(le.amount), 0) AS balance
FROM accounts a
LEFT JOIN users u
    ON u.id = a.user_id
LEFT JOIN ledger_entries le
    ON le.account_id = a.id
GROUP BY a.id, a.account_type, u.name, a.system_code, a.currency
ORDER BY a.account_type, owner, a.currency;
