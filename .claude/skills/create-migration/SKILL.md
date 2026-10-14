---
name: create-migration
description: Create a node-pg-migrate SQL migration in database/migrations from a table spec (columns, constraints, foreign keys). Use when the user asks to create or add a migration, table, column, index or constraint.
argument-hint: <migration_name> [table spec]
---

# Create a SQL migration

Arguments: `$ARGUMENTS`

The first word is the migration name (e.g. `create_accounts`). Everything after it is the spec: table name, columns, constraints. If there is no spec, ask the user for it before creating anything.

## Steps

1. **Read the existing migrations** in `database/migrations/` to learn the current schema and style. Check that every table referenced by a foreign key is created in an earlier migration. If one isn't, stop and tell the user. Also stop and ask if the spec creates a table that an earlier migration already creates; the user may want an `ALTER TABLE` migration or an edit to the existing file instead.

2. **Create the file with the project script**, never by hand, so the index prefix is correct:

   ```
   npm run migrate:create -- <migration_name>
   ```

   It prints the created path, e.g. `database/migrations/0010_create-accounts.sql` (underscores become dashes). The file contains only the `-- Up Migration` and `-- Down Migration` markers.

3. **Fill in the file** under those two markers. Keep both markers exactly as they are; node-pg-migrate splits the file on them.

4. **Do not run the migration** (`migrate:up` / `migrate:down`) unless the user explicitly asks.

5. **Reply** with the file path and the SQL you wrote, plus a short list of anything worth considering that the spec left out (e.g. no index on a foreign key column, no `ON DELETE` rule). Mention these, don't add them.

## SQL conventions (match the existing files)

- Uppercase keywords and types: `UUID`, `VARCHAR(255)`, `TIMESTAMPTZ`, `NUMERIC(19, 4)`, `NOT NULL`, `DEFAULT NOW()`.
- 4-space indentation, one column per line.
- Single-column constraints go inline on the column: `PRIMARY KEY`, `NOT NULL`, `UNIQUE`, `DEFAULT ...`, `CHECK (...)`, `REFERENCES users (id)`.
- Put `ON DELETE ...` right after its `REFERENCES`: `REFERENCES users (id) ON DELETE RESTRICT`.
- Multi-column constraints go after the columns as unnamed table constraints: `UNIQUE (user_id, currency)`, `CHECK (source_account_id <> destination_account_id)`.
- Write exactly what the spec asks for. Don't invent extra columns, constraints or indexes.
- The Down section must exactly undo the Up section, in reverse order:
  - `CREATE TABLE x` → `DROP TABLE x;`
  - `ALTER TABLE x ADD COLUMN c` → `ALTER TABLE x DROP COLUMN c;`
  - `CREATE INDEX i` → `DROP INDEX i;` (give indexes explicit names so they can be dropped)
  - `ALTER TABLE x ADD CONSTRAINT c` → `ALTER TABLE x DROP CONSTRAINT c;` (name constraints added via `ALTER`)

## Example

`/create-migration create_accounts` with columns `id`, `user_id` (FK → users, ON DELETE RESTRICT), `currency`, `status`, timestamps, and `UNIQUE(user_id, currency)`, produces:

```sql
-- Up Migration

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    currency CHAR(3) NOT NULL CHECK (currency IN ('USD', 'EUR', 'UAH')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, currency)
);

-- Down Migration

DROP TABLE accounts;
```
