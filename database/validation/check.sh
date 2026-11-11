#!/usr/bin/env bash
# Runs the reconciliation checks that must return zero rows (PRD FR-LED-05)
# and fails if any of them reports a violation. Needs psql and DATABASE_URL.
set -euo pipefail

for check in 01_ledger_balance 02_posted_operations; do
  violations=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At \
    -f "database/validation/$check.sql")

  if [ -n "$violations" ]; then
    echo "::error::$check reported violations:"
    echo "$violations"
    exit 1
  fi
done

echo "Reconciliation checks passed"
