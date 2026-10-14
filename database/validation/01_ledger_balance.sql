
--Every posted ledger transaction should have at least two entries, with signed amounts summing to zero.

SELECT lt.id AS  ledger_transaction_id,
    COUNT(le.id) AS entry_count,
    COALESCE(SUM(le.amount), 0) AS net_amount
FROM ledger_transactions lt
LEFT JOIN ledger_entries le
	ON le.ledger_transaction_id = lt.id
GROUP BY lt.id
HAVING COUNT(le.id) < 2
OR COALESCE(SUM(le.amount), 0) <> 0;

-- Expected result: zero rows.

SELECT lt.id AS  ledger_transaction_id,
    a.currency,
    COUNT(le.id) AS entry_count,
    SUM(le.amount) AS net_amount
FROM ledger_transactions lt
JOIN ledger_entries le
    ON le.ledger_transaction_id = lt.id
JOIN accounts a
    ON a.id = le.account_id
GROUP BY lt.id, a.currency
HAVING SUM(le.amount) <> 0;

-- All entries of a ledger transaction must use the same currency.

SELECT lt.id AS ledger_transaction_id,
    ARRAY_AGG(DISTINCT a.currency) AS currencies
FROM ledger_transactions lt
JOIN ledger_entries le
    ON le.ledger_transaction_id = lt.id
JOIN accounts a
    ON a.id = le.account_id
GROUP BY lt.id
HAVING COUNT(DISTINCT a.currency) > 1;

-- Expected result: zero rows.