-- One ledger transaction per posted operation (22)

INSERT INTO ledger_transactions (operation_id, description, created_at)
SELECT id, INITCAP(type), created_at
FROM financial_operations
WHERE status = 'posted';
