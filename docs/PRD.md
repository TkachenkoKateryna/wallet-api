# Wallet API — Product Requirements Document

| | |
|---|---|
| **Status** | Draft |
| **Last updated** | 2026-10-14 |
| **Related** | [Database Design](database-design.md) |

## 1. Summary

Wallet API is a side project: a backend for multi-currency digital wallets, built to practice API design and PostgreSQL. Customers hold one wallet per currency, record deposits, send money to other customers and withdraw to a linked bank account. Admins can refund operations, freeze wallets and approve large transfers.

There are **no external integrations**. A deposit or withdrawal is an API call that records money entering or leaving the system; nothing is charged or paid out anywhere. All money movements are recorded in an append-only, double-entry ledger, so every balance can be reconstructed and audited.

API clients act on behalf of customers. There is no real authentication: customer routes identify the caller by an `X-User-Id` header (simulated auth, to be replaced by real authentication later), and only return that user's own resources. Routes under `/admin` are for admin actions; `/admin` is a naming convention only and is not protected.

The service is built with NestJS, PostgreSQL and raw SQL (`pg`).

## 2. Goals and Non-Goals

### Goals

The project follows the database goals in the README:

1. **Consistent.** No sequence of requests, including concurrent and retried ones, can create or destroy money or overdraw a customer wallet.
2. **Normalized.** Data is stored once, without update anomalies; operation details live in per-type subtype tables.
3. **Auditable.** Every balance change can be traced to a financial operation and its ledger entries.
4. **Extensible.** New operation types and system accounts can be added without redesigning existing tables.
5. **Efficient.** Common queries (balances, statements, history) are backed by appropriate indexes.

Plus one API goal:

6. **Safe retries.** Clients can retry any money-moving request without risk of executing it twice.

### Non-Goals

- Any external integration: payment providers, banks, cards, email or SMS.
- Real authentication and authorization (login, tokens, roles). The `X-User-Id` header stands in for them.
- Foreign exchange between currencies.
- A full general ledger, chart of accounts or regulatory reporting.
- KYC/AML checks and fraud detection.
- A UI. This PRD covers the HTTP API only.

## 3. Database Focus

Each feature exists partly to practice a PostgreSQL concept. The `database/exercises/` files hold the standalone queries.

| Feature | Database concept | Requirements | Exercise file |
|---|---|---|---|
| Transfers under concurrency | Transactions, `SELECT … FOR UPDATE`, consistent lock order | FR-TRF-05, NFR-02 | — |
| Idempotent requests | Unique constraints, `INSERT … ON CONFLICT` | FR-OPS-01–04 | — |
| Business rules in the schema | `CHECK`, `UNIQUE` and foreign keys mapped to API errors | FR-WAL-02, FR-USR-02, §7 | — |
| Operation types | Supertype/subtype tables with shared primary keys | FR-OPS-09 | `joins.sql` |
| Balances | Aggregation over the ledger | FR-HIS-01 | `aggregations.sql` |
| Statement with running balance | Window functions | FR-HIS-02 | `window-functions.sql` |
| History pagination | Keyset pagination, composite indexes | FR-HIS-04 | `performance/pagination.sql` |
| Refund limits | Subqueries / CTEs over related operations | FR-RFD-02 | `subqueries.sql`, `ctes.sql` |
| Monthly report | Grouping by date, date functions | FR-HIS-05 | `date-analysis.sql` |
| Statement performance | Index design, `EXPLAIN (ANALYZE, BUFFERS)` | NFR-06 | `performance/indexing.sql`, `performance/query-optimization.sql` |
| Ledger integrity | Cross-row validation queries | FR-LED | `database/validation/` |

## 4. Glossary

| Term | Meaning |
|---|---|
| **Wallet** | Customer-owned account in one currency (`accounts.account_type = 'wallet'`). |
| **System account** | Internal account with no owner (`account_type = 'system'`). |
| **Settlement account** | System account (`system_code = 'settlement'`) that represents money outside the system for one currency. Counterparty for deposits and withdrawals. |
| **Financial operation** | A request to move money: `deposit`, `transfer`, `withdrawal` or `refund`. |
| **Posting** | Recording an operation in the ledger: one ledger transaction with balanced entries. |
| **Ledger entry** | Signed amount on one account. Positive increases the balance, negative decreases it. |
| **Balance** | Sum of an account's ledger entries. Never stored. |
| **Idempotency key** | Client-supplied unique key that identifies one logical request. |
| **Reference** | Optional free-text reference the client attaches to a deposit or withdrawal (stored in `provider_reference`). |

## 5. Scope

| Area | MVP | Later |
|---|---|---|
| Users | Create, view, list | Update profile |
| Wallets | Open, view with balance, list, freeze/unfreeze, close | — |
| Bank accounts | Link, list, admin verification | Remove / replace |
| Deposits | Record money entering a wallet | Reverse a deposit |
| Transfers | Wallet to wallet, same currency | Admin approval of large transfers |
| Withdrawals | Record money leaving to a verified bank account | — |
| Refunds | Full or partial refund of transfers and withdrawals | — |
| History | Wallet statement with running balance, operation list | Monthly report |
| Ledger | Posting rules, reconciliation checks | Cached balance projection |

## 6. Functional Requirements

Priority: **Must** = MVP, **Should** = MVP if time allows, **Could** = later.

### 6.1 Users

| ID | Requirement | Priority |
|---|---|---|
| FR-USR-01 | Create a user with `email` (required, valid, ≤ 255 chars), `name` (required, ≤ 100 chars) and `phone` (optional, ≤ 20 chars). | Must |
| FR-USR-02 | Email is unique. Creating a user with an existing email returns `409 Conflict`. | Must |
| FR-USR-03 | Get a user by ID. An unknown ID returns `404`; a malformed ID returns `400`. | Must |
| FR-USR-04 | List users, newest first. | Must |
| FR-USR-05 | A user that owns wallets or bank accounts cannot be deleted. | Must |

FR-USR-01 to 04 are implemented in `UsersModule`.

### 6.2 Wallets

| ID | Requirement | Priority |
|---|---|---|
| FR-WAL-01 | Open a wallet for a user in a supported currency: `USD`, `EUR` or `UAH`. New wallets are `active` with balance 0. | Must |
| FR-WAL-02 | A user has at most one wallet per currency. Opening a second one returns `409`. | Must |
| FR-WAL-03 | Get a wallet with its current balance. | Must |
| FR-WAL-04 | List a user's wallets with their balances. | Must |
| FR-WAL-05 | A wallet's currency never changes after it is opened. | Must |
| FR-WAL-06 | Admins can freeze an `active` wallet and unfreeze a `frozen` one. | Should |
| FR-WAL-07 | A wallet can be closed only when its balance is 0. `closed` is final. | Should |
| FR-WAL-08 | System accounts are never returned by, or usable through, customer-facing endpoints. A request naming a system account ID behaves as if the wallet does not exist (`404`). | Must |

**Status rules for money movement:**

| Wallet status | Can receive money | Can send money |
|---|---|---|
| `active` | Yes | Yes |
| `frozen` | No | No |
| `closed` | No | No |

### 6.3 Bank Accounts

| ID | Requirement | Priority |
|---|---|---|
| FR-BNK-01 | Link a bank account to a user: `bank_name` (≤ 100 chars), `account_number` (≤ 34 chars, IBAN length), `account_type` (`checking` or `savings`). New bank accounts are unverified. | Must |
| FR-BNK-02 | List a user's bank accounts. | Must |
| FR-BNK-03 | Admins can mark a bank account as verified. There is no external verification. | Must |
| FR-BNK-04 | Only verified bank accounts can receive withdrawals. | Must |

### 6.4 Financial Operations (all types)

| ID | Requirement | Priority |
|---|---|---|
| FR-OPS-01 | Every money-moving request carries an `Idempotency-Key` header (≤ 255 chars). Requests without one return `400`. | Must |
| FR-OPS-02 | A repeated request with the same key and the same body returns the original result, with no second operation. | Must |
| FR-OPS-03 | A request that reuses a key with a different body returns `409 Conflict`. | Must |
| FR-OPS-04 | Concurrent requests with the same key execute at most one operation. | Must |
| FR-OPS-05 | Amounts are positive decimals with at most 2 fractional digits. Zero, negative or more precise amounts return `400`. | Must |
| FR-OPS-06 | Amounts are sent and returned as strings (e.g. `"125.50"`) so JSON clients never round them as floats. | Must |
| FR-OPS-07 | All accounts in one operation use the same currency. A mismatch returns `422`. | Must |
| FR-OPS-08 | Get an operation by ID with its type, status, amount, accounts and timestamps. | Must |
| FR-OPS-09 | Each operation has exactly one detail record matching its type. | Must |

**Operation statuses:**

| Status | Meaning | Ledger entries |
|---|---|---|
| `posted` | Completed. | Yes |
| `failed` | Rejected by a business rule, e.g. insufficient funds. Recorded for history. | No |
| `pending` | Waiting for admin approval. Only large transfers use it (FR-TRF-06). | No |
| `canceled` | A pending transfer that an admin rejected. | No |

```text
request ──► posted
   │
   ├──────► failed
   │
   └──────► pending ──► posted   (admin approves, funds still available)
                  ├───► failed   (admin approves, funds no longer available)
                  └───► canceled (admin rejects)
```

- Every operation except a pending transfer reaches a final status within its request.
- An operation is posted at most once.
- Posting writes the ledger rows and sets `status = 'posted'` in the same database transaction.
- `posted`, `failed` and `canceled` are final.
- Until FR-TRF-06 is built, `pending` and `canceled` appear only in seed data.

### 6.5 Deposits

| ID | Requirement | Priority |
|---|---|---|
| FR-DEP-01 | Record a deposit to a wallet: amount, optional `reference` (≤ 255 chars) and optional `note` (≤ 255 chars). | Must |
| FR-DEP-02 | The target must be an `active` customer wallet; otherwise the request returns `422`. | Must |
| FR-DEP-03 | A deposit credits the wallet and debits the settlement account of the same currency. | Must |
| FR-DEP-04 | Deposits post within the request, and the response returns the posted operation. | Must |

**Ledger posting — deposit of 500 USD:**

| Account | Amount |
|---|---:|
| Customer wallet | +500.00 |
| USD settlement | −500.00 |

### 6.6 Transfers

| ID | Requirement | Priority |
|---|---|---|
| FR-TRF-01 | Transfer an amount from one wallet to another, with an optional `note` (≤ 255 chars). | Must |
| FR-TRF-02 | Source and destination are different, `active` customer wallets in the same currency. | Must |
| FR-TRF-03 | The source wallet's balance after the transfer must be ≥ 0. Otherwise the operation is recorded as `failed` and the request returns `422` with code `INSUFFICIENT_FUNDS`. | Must |
| FR-TRF-04 | A posted transfer debits the source and credits the destination by the same amount. | Must |
| FR-TRF-05 | Two concurrent transfers from the same wallet cannot together overdraw it. | Must |
| FR-TRF-06 | Transfers above a configurable per-currency threshold are created as `pending`, with no ledger entries and no funds reserved. An admin approves one (re-checking the balance under lock, then posting it or marking it `failed`) or cancels it (`canceled`). | Could |
| FR-TRF-07 | Admins can list pending transfers, oldest first. | Could |

**Ledger posting — transfer of 100 USD:**

| Account | Amount |
|---|---:|
| Source wallet | −100.00 |
| Destination wallet | +100.00 |

### 6.7 Withdrawals

| ID | Requirement | Priority |
|---|---|---|
| FR-WDR-01 | Record a withdrawal from a wallet to a bank account: amount, optional `reference` and optional `note`. | Must |
| FR-WDR-02 | The wallet is `active`; the bank account is verified **and belongs to the wallet's owner**. Otherwise `422`. | Must |
| FR-WDR-03 | The wallet balance after the withdrawal must be ≥ 0; otherwise the operation is `failed` and the request returns `422 INSUFFICIENT_FUNDS`. | Must |
| FR-WDR-04 | A posted withdrawal debits the wallet and credits the settlement account of the same currency. | Must |
| FR-WDR-05 | A withdrawal `reference`, when given, is unique across withdrawals. A duplicate returns `409`. | Must |
| FR-WDR-06 | Withdrawals post within the request. No money is sent anywhere. | Must |

**Ledger posting — withdrawal of 50 USD:**

| Account | Amount |
|---|---:|
| Customer wallet | −50.00 |
| USD settlement | +50.00 |

### 6.8 Refunds

| ID | Requirement | Priority |
|---|---|---|
| FR-RFD-01 | Admins can refund a `posted` transfer or withdrawal, fully or partially, with an optional `reason`. | Must |
| FR-RFD-02 | An operation can be refunded several times, but the total of its posted refunds never exceeds its amount. Exceeding it returns `422`. | Must |
| FR-RFD-03 | A refund is a new operation with its own ledger transaction. The original operation and its entries are never changed. | Must |
| FR-RFD-04 | A refund of a transfer debits the original destination wallet and credits the original source wallet. If the destination wallet lacks funds, the refund is `failed` (`422 INSUFFICIENT_FUNDS`). | Must |
| FR-RFD-05 | A refund of a withdrawal returns the money to the original wallet: it debits the settlement account and credits the wallet. | Must |
| FR-RFD-06 | Refunds themselves cannot be refunded. Pending, failed and canceled operations cannot be refunded. | Must |
| FR-RFD-07 | Reverse a deposit recorded by mistake: debit the wallet, credit settlement. | Could |

**Ledger posting — refund of X:**

| Refunded operation | Entries |
|---|---|
| Transfer | Destination wallet −X, source wallet +X |
| Withdrawal | Settlement −X, customer wallet +X |
| Deposit (later) | Customer wallet −X, settlement +X |

### 6.9 Balances and History

| ID | Requirement | Priority |
|---|---|---|
| FR-HIS-01 | A wallet's balance is the sum of its ledger entries. Pending, failed and canceled operations do not affect it. | Must |
| FR-HIS-02 | Statement: list a wallet's ledger entries, newest first, each with its signed amount, the **running balance after that entry**, operation ID and type, counterparty wallet (for transfers) and timestamp. | Must |
| FR-HIS-03 | List a wallet's operations of every status, newest first, filterable by type and status. | Should |
| FR-HIS-04 | Lists are paginated with a cursor (`created_at`, `id`) and a page size of at most 100. | Should |
| FR-HIS-05 | Admin report: per currency and calendar month, the count and total of posted deposits, withdrawals, transfers and refunds. | Could |

### 6.10 Ledger Integrity and Reconciliation

| ID | Requirement | Priority |
|---|---|---|
| FR-LED-01 | Every posted operation has exactly one ledger transaction; non-posted operations have none. | Must |
| FR-LED-02 | Each ledger transaction has at least two entries, all in one currency, summing to exactly 0. | Must |
| FR-LED-03 | Ledger entries are never updated or deleted. Corrections are new operations. | Must |
| FR-LED-04 | For each currency, the sum of all balances (wallets plus settlement) is 0. | Must |
| FR-LED-05 | Reconciliation checks (`database/validation/`) report zero violations on seeded data and after every test run. | Must |
| FR-LED-06 | Admins can run a reconciliation report over the API: per-currency totals and any unbalanced transactions. | Could |

## 7. Error Handling

Errors use one JSON shape:

```json
{
  "statusCode": 422,
  "code": "INSUFFICIENT_FUNDS",
  "message": "Wallet balance is lower than the requested amount"
}
```

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed body, ID, amount or missing idempotency key |
| 401 | `UNAUTHORIZED` | Missing or malformed `X-User-Id`, or no user with that id |
| 404 | `NOT_FOUND` | Unknown user, wallet, bank account or operation, including system accounts and resources owned by another user (never 403, so ids can't be probed) |
| 409 | `EMAIL_TAKEN` | Duplicate email |
| 409 | `WALLET_EXISTS` | Second wallet in the same currency |
| 409 | `DUPLICATE_REFERENCE` | Withdrawal reference already used |
| 409 | `IDEMPOTENCY_CONFLICT` | Key reused with a different request |
| 422 | `INSUFFICIENT_FUNDS` | Debit would overdraw a customer wallet |
| 422 | `WALLET_NOT_ACTIVE` | Wallet is frozen or closed |
| 422 | `CURRENCY_MISMATCH` | Accounts in different currencies |
| 422 | `BANK_ACCOUNT_NOT_VERIFIED` | Withdrawal to an unverified bank account |
| 422 | `REFUND_EXCEEDS_ORIGINAL` | Refund total above the original amount |
| 422 | `OPERATION_NOT_REFUNDABLE` | Original is not a posted transfer or withdrawal |
| 422 | `OPERATION_NOT_PENDING` | Approving or canceling a transfer that is not pending |
| 503 | `TRY_AGAIN` | Transient database conflict (deadlock, serialization failure) after internal retries |

Database constraint violations must be translated to these errors. Raw database errors are never returned to clients.

## 8. Non-Functional Requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-01 | Atomicity | An operation's records, ledger rows and status change commit in one PostgreSQL transaction on one connection, or not at all. |
| NFR-02 | Concurrency | Balance-changing operations lock the affected wallets with `SELECT … FOR UPDATE` in ascending ID order. No double spending under concurrent load. |
| NFR-03 | Retries | Deadlocks and serialization failures are retried internally (up to 3 attempts) before returning `503`. |
| NFR-04 | Precision | Money is stored as `NUMERIC` and handled as strings or decimal types in code. Floating-point numbers are never used for money. |
| NFR-05 | Auditability | Every operation stores creation and update timestamps; logs include the operation ID and idempotency key. |
| NFR-06 | Performance | Balance and statement queries for a wallet with 10,000 entries return in under 100 ms on a development machine, backed by the indexes in the design doc. |
| NFR-07 | Schema changes | All schema changes are versioned, reversible SQL migrations. No ORM. |
| NFR-08 | Testability | Money flows are covered by end-to-end tests against a real PostgreSQL database, including concurrent-request tests. |
| NFR-09 | Data safety | Seed scripts that reset data run only against approved local databases. |

## 9. API Surface (proposed)

Customer routes act on the caller from `X-User-Id`. Routes marked ✓ are implemented; the rest are indicative.

| Method | Route | FR |
|---|---|---|
| `POST` | `/users` ✓ | FR-USR-01 |
| `GET` | `/users`, `/users/:id` ✓ | FR-USR-03, 04 |
| `POST` | `/accounts` ✓ | FR-WAL-01 |
| `GET` | `/accounts` ✓ | FR-WAL-04 |
| `GET` | `/accounts/:id` ✓ | FR-WAL-03 |
| `GET` | `/accounts/:id/balance` ✓ | FR-WAL-03, FR-HIS-01 |
| `GET` | `/accounts/:id/transactions?limit=&cursor=` ✓ | FR-HIS-02, 04 |
| `GET` | `/accounts/:id/operations` | FR-HIS-03 |
| `POST` | `/bank-accounts` | FR-BNK-01 |
| `GET` | `/bank-accounts` | FR-BNK-02 |
| `POST` | `/deposits` | FR-DEP-01 |
| `POST` | `/transfers` | FR-TRF-01 |
| `POST` | `/withdrawals` | FR-WDR-01 |
| `GET` | `/operations/:id` | FR-OPS-08 |
| `GET` | `/admin/users/:userId/accounts` ✓ | FR-WAL-04 |
| `POST` | `/admin/accounts/:id/freeze`, `/unfreeze`, `/close` ✓ | FR-WAL-06, 07 |
| `POST` | `/admin/bank-accounts/:id/verify` | FR-BNK-03 |
| `POST` | `/admin/operations/:id/refunds` | FR-RFD-01 |
| `GET` | `/admin/transfers/pending` | FR-TRF-07 |
| `POST` | `/admin/transfers/:id/approve`, `/cancel` | FR-TRF-06 |
| `GET` | `/admin/reports/monthly` | FR-HIS-05 |
| `GET` | `/admin/reconciliation` | FR-LED-06 |

## 10. Delivery Plan

| Phase | Content | Exit criteria |
|---|---|---|
| 0 | Schema, migrations, seeds, validation scripts | Done |
| 1 | Users | Done |
| 2 | Wallets and balances, statement | FR-WAL, FR-HIS-01/02 |
| 3 | Posting service, deposits, transfers | FR-OPS, FR-DEP, FR-TRF-01–05; concurrency tests pass |
| 4 | Bank accounts, withdrawals | FR-BNK, FR-WDR |
| 5 | Refunds, admin endpoints, reconciliation | FR-RFD, FR-LED |
| 6 | Optional: transfer approval, monthly report | FR-TRF-06/07, FR-HIS-05 |

The posting service in phase 3 is shared by every later operation type, so it is built and tested before them.

## 11. Success Criteria

- Reconciliation (FR-LED-04, 05) reports zero violations after every test run.
- A test firing 50 concurrent transfers from one wallet never leaves it with a negative balance.
- A test repeating the same request 10 times, concurrently, creates exactly one operation.
- Every functional requirement marked **Must** has at least one automated test.
- Statement and history queries meet NFR-06, confirmed with `EXPLAIN (ANALYZE, BUFFERS)`.

## 12. Open Questions

| # | Question | Proposed answer |
|---|---|---|
| 1 | Where is the reason for a `failed` operation stored? The schema has no column for it. | Add `failure_code` to `financial_operations`. |
| 2 | Should transfers between two wallets of the same user be allowed? With one wallet per currency they can't happen today. | Not needed. |
| 3 | Settlement accounts are created only by development seeds, so a database built from migrations alone (e.g. for e2e tests) has none. | Insert them in a migration. |
| 4 | Should a deposit `reference` be unique, like a withdrawal's? | Yes, for symmetry with withdrawals. |
| 5 | The database stores 4 fractional digits; currencies need 2. | Validate 2 digits at the API (FR-OPS-05); keep the column as is. |
| 6 | `CreateUserDto` allows phones up to 30 characters, but `users.phone` is `VARCHAR(20)`. Longer values currently cause a database error. | Align the DTO to 20 (FR-USR-01). |
