SELECT 
    fo.id, 
    fo.type,
    fo.status
FROM financial_operations fo
LEFT JOIN ledger_transactions lt
  ON lt.operation_id = fo.id
WHERE fo.status = 'posted'
  AND lt.id IS NULL;

-- Expected result: zero rows, assuming posted means the operation has already been recorded in the ledger.