// Usage: npm run seed:dev
//   or:  node --env-file-if-exists=.env database/seeds/seed.ts [seed-set]
// The script reads process.env only; the flag is what loads a local .env.
//
// Empties every table in RESET_TABLES, then runs every
// database/seeds/<seed-set>/NN_<table>.sql file in name order, all inside one
// transaction. Only resets explicitly approved local development databases.
//
// Safety checks before anything is deleted:
//   - ALLOW_DB_RESET=true must be set (in .env or the environment)
//   - the database name must be in ALLOWED_DATABASES
//   - the host must be in LOCAL_HOSTS (an SSH tunnel can still make a remote
//     server look local, so never set ALLOW_DB_RESET when tunnelling)
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const SEED_SETS = ['development'];

// All wallet tables. Update this list when a migration adds a table.
const RESET_TABLES = [
  'ledger_entries',
  'ledger_transactions',
  'refunds',
  'withdrawals',
  'transfers',
  'deposits',
  'financial_operations',
  'bank_accounts',
  'accounts',
  'users',
];

const ALLOWED_DATABASES = ['wallet'];

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

const seedSet = process.argv[2] ?? 'development';
const seedDirPath = `database/seeds/${seedSet}`;
const seedDir = new URL(`./${seedSet}/`, import.meta.url);

// Postgres reports error positions as a character offset into the query
function lineAt(sql: string, position: string): number {
  return sql.slice(0, Number(position) - 1).split('\n').length;
}

function formatError(error: unknown): string {
  // e.g. connection refused on both ::1 and 127.0.0.1: the reasons are in .errors
  if (error instanceof AggregateError) {
    return error.errors
      .map((inner) => (inner instanceof Error ? inner.message : String(inner)))
      .join('; ');
  }
  if (!(error instanceof pg.DatabaseError)) {
    return error instanceof Error ? error.message : String(error);
  }
  const lines = [`${error.message} (SQLSTATE ${error.code})`];
  if (error.detail) lines.push(`detail: ${error.detail}`);
  if (error.constraint) lines.push(`constraint: ${error.constraint}`);
  if (error.hint) lines.push(`hint: ${error.hint}`);
  return lines.join('\n  ');
}

let step = 'setup';
let sql: string | undefined;
let client: pg.Client | undefined;
let inTransaction = false;

try {
  if (!SEED_SETS.includes(seedSet)) {
    throw new Error(
      `unknown seed set "${seedSet}". Expected one of: ${SEED_SETS.join(', ')}`,
    );
  }

  const files = (await readdir(seedDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  if (files.length === 0)
    throw new Error(`no .sql files found in ${seedDirPath}/`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error('DATABASE_URL is not set (environment or .env)');

  if (process.env.ALLOW_DB_RESET !== 'true') {
    throw new Error('set ALLOW_DB_RESET=true to permit destructive seeding');
  }

  const target = new URL(connectionString);
  const databaseName = decodeURIComponent(target.pathname.slice(1));
  const targetName = `${target.hostname}:${target.port || 5432}/${databaseName}`;

  if (!ALLOWED_DATABASES.includes(databaseName)) {
    throw new Error(
      `database "${databaseName}" is not approved for seeding. Approved: ${ALLOWED_DATABASES.join(', ')}`,
    );
  }
  if (!LOCAL_HOSTS.includes(target.hostname)) {
    throw new Error(`refusing to reset non-local database ${targetName}`);
  }

  client = new pg.Client({ connectionString });
  await client.connect();

  // Guard against connection settings that point somewhere other than the URL says
  const { rows } = await client.query<{ database_name: string }>(
    'SELECT current_database() AS database_name',
  );
  if (rows[0].database_name !== databaseName) {
    throw new Error(
      `connected to "${rows[0].database_name}", expected "${databaseName}"`,
    );
  }

  await client.query('BEGIN');
  inTransaction = true;
  console.log(`Seeding ${targetName} with "${seedSet}"`);

  step = 'emptying tables';
  sql = `TRUNCATE ${RESET_TABLES.join(', ')}`;
  await client.query(sql);
  console.log(`Emptied ${RESET_TABLES.length} tables`);

  for (const file of files) {
    step = `${seedDirPath}/${file}`;
    sql = await readFile(new URL(file, seedDir), 'utf8');
    const result: pg.QueryResult | pg.QueryResult[] = await client.query(sql);
    const rowCount = [result]
      .flat()
      .reduce((sum, r) => sum + (r.rowCount ?? 0), 0);
    console.log(`  ✓ ${file} (${rowCount} rows)`);
  }

  step = 'committing transaction';
  await client.query('COMMIT');
  inTransaction = false;
  console.log(`Seed set "${seedSet}" applied (${files.length} files)`);
} catch (error) {
  // Roll back before logging, but don't let a failed ROLLBACK hide the original error
  let rollbackSucceeded = false;
  if (inTransaction && client) {
    try {
      await client.query('ROLLBACK');
      rollbackSucceeded = true;
    } catch {
      // Connection may have been lost
    }
  }

  const position =
    error instanceof pg.DatabaseError ? error.position : undefined;
  const location = position && sql ? `${step}:${lineAt(sql, position)}` : step;
  console.error(`\n✗ Seed set "${seedSet}" failed in ${location}`);
  console.error(`  ${formatError(error)}`);
  if (rollbackSucceeded) {
    console.error('Transaction rolled back. No changes were saved.');
  } else if (inTransaction) {
    console.error(
      'Transaction outcome could not be confirmed. Verify database state.',
    );
  }
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
